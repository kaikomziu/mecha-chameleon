import * as THREE from 'https://esm.sh/three@0.160.0';
import { buildWorld, resolveCollisions, randomSpawnPoint } from './world.js';
import { Character, POSES } from './character.js';
import { Controls } from './controls.js';
import { PaintController } from './paint.js';
import { BotAI } from './botAI.js';
import { GameChannel, throttle } from '../network.js';
import { mountChat } from '../chatUI.js';
import { supabase } from '../supabaseClient.js';
import { endRound, backToLobby, advancePhase } from '../rooms.js';
import { getUser, refreshProfile } from '../auth.js';
import { rankTierForWins } from '../config.js';

const PLAYER_RADIUS = 0.38;
const HUNTER_COLOR = '#e8622c';

export class Game {
  constructor({ container, uiRoot, room, players, onExit }) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.room = room;
    this.players = players;
    this.myId = getUser().id;
    this.onExit = onExit;
    this.remote = new Map(); // userId -> { group, character?, mesh, target: {x,z,yaw}, role }
    this.aliveHiders = new Set();
    this.votedSkip = new Set();
    this.lastRoundRecorded = -1;
    this.lastPhase = null;
    this.caught = false;

    this._initThree();
    this._initCharacterAndControls();
    this._initHUD();
    this._initNetwork();
    this.chatWidget = mountChat(this.uiRoot, this.room.id, { compact: true });

    this.botAI = new BotAI({
      world: this.world,
      sendPos: (p) => this._botSendPos(p),
      sendPaint: (p) => this._botSendPaint(p),
      triggerFound: (targetUserId, byBotId) => this._botTriggerFound(targetUserId, byBotId),
    });
    this.botAI.setBots(this.players.filter((p) => p.is_bot));

    this.clock = new THREE.Clock();
    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  get isHost() {
    return this.room.host_id === this.myId;
  }
  get myPlayer() {
    return this.players.find((p) => p.user_id === this.myId);
  }
  get myRole() {
    return this.myPlayer?.role;
  }

  _initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f14);
    this.scene.fog = new THREE.Fog(0x0d0f14, 14, 30);

    this.camera = new THREE.PerspectiveCamera(72, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.world = buildWorld(this.scene);

    this._onResize = () => {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  _spawnPoint() {
    return randomSpawnPoint(this.world);
  }

  _initCharacterAndControls() {
    this.character = new Character('standing');
    this.pos = { x: 0, z: 0 };
    [this.pos.x, this.pos.z] = this._spawnPoint();

    this.controls = new Controls({
      domElement: this.renderer.domElement,
      uiRoot: this.uiRoot,
      camera: this.camera,
      onFire: () => this._attemptShoot(),
    });
    this.controls.setEnabled(false);

    this.paintController = new PaintController({
      renderer: this.renderer,
      dom: this.uiRoot,
      character: this.character,
      onChanged: () => {},
    });
    this.paintController.onConfirm(() => this._closePaintMode());
  }

  _initHUD() {
    const hud = document.createElement('div');
    hud.className = 'game-hud';
    hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-phase"></div>
        <div class="hud-timer">--</div>
        <div class="hud-role"></div>
      </div>
      <div class="hud-alive"></div>
      <button class="hud-repaint hidden">🎨 擬態を直す</button>
      <button class="hud-vote-skip">もうええよ (0/0)</button>
      <div class="hud-overlay hidden"><div class="hud-overlay-inner"></div></div>
      <div class="hit-flash hidden"></div>
      <div class="crosshair hidden">+</div>
    `;
    this.uiRoot.appendChild(hud);
    this.hud = hud;
    this.hud.querySelector('.hud-vote-skip').addEventListener('click', () => this._castVoteSkip());
    this.hud.querySelector('.hud-repaint').addEventListener('click', () => this._openPaintMode());
  }

  _initNetwork() {
    this.channel = new GameChannel(this.room.id);
    this.channel
      .on('pos', (p) => this._onRemotePos(p))
      .on('paint', (p) => this._onRemotePaint(p))
      .on('hider_found', (p) => this._onHiderFound(p))
      .on('vote_skip', (p) => this._onVoteSkip(p));
    this.channel.subscribe();

    this.sendPos = throttle((payload) => this.channel.send('pos', payload), 90);
  }

  // ============ フェーズ制御 ============
  setPlayers(players) {
    this.players = players;
    if (this.isHost) this.botAI.setBots(players.filter((p) => p.is_bot));
  }

  setPhase(room) {
    const prevStatus = this.lastPhase;
    this.room = room;
    if (room.status === prevStatus) return;
    this.lastPhase = room.status;

    this.hud.querySelector('.hud-phase').textContent = {
      waiting: '待機中', hiding: '🫥 隠れフェーズ', seeking: '🔫 索敵フェーズ', results: '結果発表',
    }[room.status] || '';
    this.votedSkip.clear();
    this._updateVoteButton();

    if (room.status === 'hiding') this._enterHiding(prevStatus);
    else if (room.status === 'seeking') this._enterSeeking(prevStatus);
    else if (room.status === 'results') this._enterResults();
  }

  _enterHiding(prevStatus) {
    this.caught = false;
    this.aliveHiders = new Set(this.players.filter((p) => p.role === 'hider').map((p) => p.user_id));
    for (const [, r] of this.remote) this._removeRemote(r);
    this.remote.clear();
    this.character.resetPaint();
    this.character.setPose('standing');
    [this.pos.x, this.pos.z] = this._spawnPoint();
    this.camera.position.set(this.pos.x, POSES.standing.eyeHeight, this.pos.z);
    this.controls.yaw = Math.random() * Math.PI * 2;
    this.controls.pitch = 0;

    const isHider = this.myRole === 'hider';
    this.controls.setEnabled(isHider);
    this.controls.setMoveLocked?.(false);
    this.controls.setFireButtonVisible(false);
    this.hud.querySelector('.hud-role').textContent = isHider ? 'あなた: 隠れる側 🫥' : 'あなた: 鬼 🔫';
    this.hud.querySelector('.hud-repaint').classList.toggle('hidden', !isHider);
    this.hud.querySelector('.crosshair').classList.add('hidden');
    this._setOverlay(isHider ? null : '鬼は目を閉じて待機中…\n隠れる側が擬態しています');

    if (isHider) this._openPaintMode();
    if (this.isHost) this.botAI.enterHiding();
  }

  _enterSeeking(prevStatus) {
    // 隠れる側: 最終位置・ペイントを送信してから操作をロック
    if (this.myRole === 'hider' && !this.caught) {
      this._sendPaintSnapshot();
      this._sendPosNow();
    }
    this.paintController.hide();
    const isHunter = this.myRole === 'hunter';
    this.controls.setEnabled(isHunter || (this.myRole === 'hider' && !this.caught));
    if (this.myRole === 'hider') this.controls.setMoveLocked?.(true); // 視点だけ動かせる
    this.controls.setFireButtonVisible(isHunter);
    this.hud.querySelector('.crosshair').classList.toggle('hidden', !isHunter);
    this.hud.querySelector('.hud-repaint').classList.add('hidden');
    this._setOverlay(this.caught ? '見つかってしまった…\n結果発表をお待ちください' : null);
    if (this.isHost) {
      const realHiderPositions = [...this._aliveHiderPositions()]
        .filter(([id]) => !this.players.find((p) => p.user_id === id)?.is_bot)
        .map(([, pos]) => pos);
      this.botAI.enterSeeking(realHiderPositions);
    }
  }

  _enterResults() {
    this.controls.setEnabled(false);
    this.controls.setFireButtonVisible(false);
    this.hud.querySelector('.crosshair').classList.add('hidden');
    const won = this.myRole === this.room.winner_side;
    const winnerLabel = this.room.winner_side === 'hunter' ? '鬼チームの勝利!' : '隠れる側の勝利!';
    this._setOverlay(`${winnerLabel}\n\nあなたは ${won ? '勝利 🎉' : '敗北…'}`);

    if (this.room.round_no !== this.lastRoundRecorded && this.myRole) {
      this.lastRoundRecorded = this.room.round_no;
      supabase.rpc('mc_record_result', { p_won: won, p_role: this.myRole }).then(() => refreshProfile());
    }
    if (this.isHost) {
      clearTimeout(this._backToLobbyTimer);
      this._backToLobbyTimer = setTimeout(() => backToLobby(this.room.id), 9000);
    }
  }

  _setOverlay(text) {
    const el = this.hud.querySelector('.hud-overlay');
    const inner = this.hud.querySelector('.hud-overlay-inner');
    if (!text) { el.classList.add('hidden'); return; }
    inner.textContent = text;
    el.classList.remove('hidden');
  }

  // ============ ペイントモード ============
  _openPaintMode() {
    this.paintMode = true;
    this.controls.setEnabled(false);
    const mirrorCam = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 20);
    mirrorCam.position.set(this.pos.x, 1.2, this.pos.z + 2.4);
    mirrorCam.lookAt(this.pos.x, 1.0, this.pos.z);
    this.character.group.position.set(this.pos.x, 0, this.pos.z);
    if (!this.scene.children.includes(this.character.group)) this.scene.add(this.character.group);
    this._mirrorCam = mirrorCam;
    this.paintController.show(mirrorCam);
  }

  _closePaintMode() {
    this.paintMode = false;
    this.paintController.hide();
    this.scene.remove(this.character.group);
    if (this.room.status === 'hiding' && this.myRole === 'hider') this.controls.setEnabled(true);
    this._sendPaintSnapshot();
  }

  _sendPaintSnapshot() {
    this.channel.send('paint', {
      userId: this.myId,
      dataUrl: this.character.exportPaintDataURL(),
      pose: this.character.pose,
      x: this.pos.x, z: this.pos.z,
    });
  }

  _sendPosNow() {
    this.channel.send('pos', {
      userId: this.myId, role: this.myRole,
      x: this.pos.x, z: this.pos.z, yaw: this.controls.yaw, pose: this.character.pose,
    });
  }

  // ============ ネットワーク受信 ============
  _ensureRemote(userId, role) {
    let r = this.remote.get(userId);
    if (!r) {
      const group = new THREE.Group();
      let character = null, mesh;
      if (role === 'hider') {
        character = new Character('standing');
        mesh = character.group;
      } else {
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.32, 0.9, 6, 16),
          new THREE.MeshStandardMaterial({ color: HUNTER_COLOR, roughness: 0.6 })
        );
        mesh.position.y = 0.77;
      }
      mesh.traverse?.((o) => (o.userData.playerId = userId));
      mesh.userData.playerId = userId;
      group.add(mesh);
      this.scene.add(group);
      r = { group, character, mesh, target: { x: 0, z: 0, yaw: 0 }, role };
      this.remote.set(userId, r);
    }
    return r;
  }

  _removeRemote(r) {
    this.scene.remove(r.group);
    r.character?.dispose();
  }

  _onRemotePos(p) {
    if (p.userId === this.myId) return;
    const r = this._ensureRemote(p.userId, p.role);
    r.target.x = p.x; r.target.z = p.z; r.target.yaw = p.yaw || 0;
    if (r.character && p.pose && r.character.pose !== p.pose) r.character.setPose(p.pose);
  }

  _onRemotePaint(p) {
    if (p.userId === this.myId) return;
    const r = this._ensureRemote(p.userId, 'hider');
    r.character?.applyPaintDataURL(p.dataUrl);
    if (p.pose) r.character.setPose(p.pose);
    r.target.x = p.x; r.target.z = p.z;
    r.group.position.set(p.x, 0, p.z);
  }

  _onHiderFound(p) {
    this._applyHiderFound(p.targetUserId);
  }

  // 隠れる側1人が見つかったときの共通処理。自分の発砲・他人の発砲(ネットワーク受信)・
  // CPUの発砲のいずれからも同じ経路で呼ばれる。
  _applyHiderFound(targetUserId) {
    this.aliveHiders.delete(targetUserId);
    const r = this.remote.get(targetUserId);
    if (r) { this._removeRemote(r); this.remote.delete(targetUserId); }
    const p = this.players.find((pl) => pl.user_id === targetUserId);
    if (p) p.alive = false;

    if (targetUserId === this.myId) {
      this.caught = true;
      supabase.from('mc_room_players').update({ alive: false }).eq('room_id', this.room.id).eq('user_id', this.myId);
      this._setOverlay('見つかってしまった…\n結果発表をお待ちください');
      this.controls.setEnabled(false);
    } else if (this.isHost && p?.is_bot) {
      // ボットは自分でDBを更新できないのでホストが代理更新
      supabase.from('mc_room_players').update({ alive: false }).eq('room_id', this.room.id).eq('user_id', targetUserId);
    }
    this._updateAliveHUD();
    if (this.isHost && this.room.status === 'seeking' && this.aliveHiders.size === 0) {
      endRound(this.room, 'hunter', this.players);
    }
  }

  // ============ CPU用ブロードキャスト橋渡し(ホストのみ) ============
  // self:false のBroadcastは送信者自身には返ってこないため、ホストの画面にも
  // ボットを映すには送信と同時にローカルにも同じ処理を直接適用する。
  _botSendPos(payload) {
    this.channel.send('pos', payload);
    this._onRemotePos(payload);
  }
  _botSendPaint(payload) {
    this.channel.send('paint', payload);
    this._onRemotePaint(payload);
  }
  _botTriggerFound(targetUserId, byBotId) {
    this.channel.send('hider_found', { targetUserId, by: byBotId });
    this._applyHiderFound(targetUserId);
  }
  *_aliveHiderPositions() {
    for (const id of this.aliveHiders) {
      const r = this.remote.get(id);
      if (r) yield [id, { x: r.target.x, z: r.target.z }];
    }
  }

  _updateAliveHUD() {
    const el = this.hud.querySelector('.hud-alive');
    if (this.myRole === 'hunter' && this.room.status === 'seeking') {
      el.textContent = `残り隠れ人数: ${this.aliveHiders.size}`;
    } else {
      el.textContent = '';
    }
  }

  // ============ 投票スキップ ============
  _castVoteSkip() {
    if (this.votedSkip.has(this.myId)) return;
    this.votedSkip.add(this.myId);
    this._updateVoteButton();
    this.channel.send('vote_skip', { userId: this.myId });
    this._maybeSkipPhase();
  }
  _onVoteSkip(p) {
    this.votedSkip.add(p.userId);
    this._updateVoteButton();
    if (this.isHost) this._maybeSkipPhase();
  }
  _updateVoteButton() {
    const total = this.players.filter((p) => !p.is_bot).length || 1; // CPUは投票に数えない
    this.hud.querySelector('.hud-vote-skip').textContent = `もうええよ (${this.votedSkip.size}/${total})`;
  }
  _maybeSkipPhase() {
    if (!this.isHost) return;
    const total = this.players.filter((p) => !p.is_bot).length || 1;
    if (this.votedSkip.size > total / 2) this._resolvePhaseEnd();
  }

  // ============ 発砲 ============
  _attemptShoot() {
    if (this.room.status !== 'seeking' || this.myRole !== 'hunter') return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    const hits = ray.intersectObjects(this.scene.children, true).filter((h) => h.distance < 30);
    if (!hits.length) return;
    const first = hits[0];
    let obj = first.object;
    let pid = obj.userData.playerId;
    while (!pid && obj.parent) { obj = obj.parent; pid = obj.userData?.playerId; }
    if (pid && this.remote.get(pid)?.role === 'hider') {
      this._flashHit(true);
      this.channel.send('hider_found', { targetUserId: pid, by: this.myId });
      this._applyHiderFound(pid);
    } else {
      this._flashHit(false);
    }
  }
  _flashHit(success) {
    const el = this.hud.querySelector('.hit-flash');
    el.style.background = success ? 'rgba(255,80,60,0.35)' : 'rgba(255,255,255,0.12)';
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 120);
  }

  // ============ ホスト: タイムアウト解決 ============
  _resolvePhaseEnd() {
    if (!this.isHost) return;
    if (this.room.status === 'hiding') {
      advancePhase(this.room.id, 'seeking', 90);
    } else if (this.room.status === 'seeking') {
      endRound(this.room, this.aliveHiders.size > 0 ? 'hider' : 'hunter', this.players);
    }
  }

  // ============ メインループ ============
  _tick() {
    this._raf = requestAnimationFrame(this._tick.bind(this));
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.paintMode) {
      this.renderer.render(this.scene, this._mirrorCam);
      return;
    }

    const { moveX, moveZ } = this.controls.update();
    if ((moveX || moveZ) && this.controls.enabled) {
      const speed = 3.1;
      const yaw = this.controls.yaw;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const dx = (moveX * cos - moveZ * sin) * speed * dt;
      const dz = (moveX * sin + moveZ * cos) * speed * dt;
      const nx = this.pos.x + dx, nz = this.pos.z + dz;
      const [rx, rz] = resolveCollisions(nx, nz, PLAYER_RADIUS, this.world.colliders);
      this.pos.x = rx; this.pos.z = rz;
      this.sendPos({ userId: this.myId, role: this.myRole, x: this.pos.x, z: this.pos.z, yaw: this.controls.yaw, pose: this.character.pose });
    }
    const eyeHeight = this.myRole === 'hider' ? POSES[this.character.pose].eyeHeight : 1.6;
    this.camera.position.set(this.pos.x, eyeHeight, this.pos.z);

    for (const [, r] of this.remote) {
      r.group.position.x += (r.target.x - r.group.position.x) * Math.min(1, dt * 8);
      r.group.position.z += (r.target.z - r.group.position.z) * Math.min(1, dt * 8);
      if (r.role === 'hunter') r.group.rotation.y += (r.target.yaw - r.group.rotation.y) * Math.min(1, dt * 8);
    }

    // ホスト: CPUの索敵AIをシミュレート
    if (this.isHost && this.room.status === 'seeking') {
      this.botAI.tick(dt, performance.now(), () => this._aliveHiderPositions());
    }

    // ホスト: フェーズタイムアウトの監視
    if (this.isHost && this.room.phase_ends_at) {
      const remain = new Date(this.room.phase_ends_at).getTime() - Date.now();
      if (remain <= 0) this._resolvePhaseEnd();
    }
    // タイマー表示(全員)
    if (this.room.phase_ends_at) {
      const remain = Math.max(0, Math.ceil((new Date(this.room.phase_ends_at).getTime() - Date.now()) / 1000));
      this.hud.querySelector('.hud-timer').textContent = `${remain}s`;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._backToLobbyTimer);
    window.removeEventListener('resize', this._onResize);
    this.botAI.destroy();
    this.chatWidget.destroy();
    this.channel.destroy();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hud.remove();
    this.paintController.root.remove();
    this.controls.hint?.remove();
    this.controls.stickEl?.remove();
    this.controls.fireBtn?.remove();
  }
}
