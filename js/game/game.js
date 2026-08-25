import * as THREE from 'https://esm.sh/three@0.160.0';
import { buildWorld, resolveCollisions, randomSpawnPoint } from './world.js';
import { Character, POSES } from './character.js';
import { Controls } from './controls.js';
import { PaintController } from './paint.js';
import { BotAI } from './botAI.js';
import { GameChannel, throttle } from '../network.js';
import { mountChat } from '../chatUI.js';
import { getUser } from '../auth.js';
import { phaseMethods } from './gamePhases.js';
import { networkMethods } from './gameNetwork.js';
import { combatMethods } from './gameCombat.js';
import { hudMethods } from './gameHud.js';

const PLAYER_RADIUS = 0.38;

// ゲーム本体。フェーズ制御(gamePhases.js)・ネットワーク受信(gameNetwork.js)・
// 発砲/投票(gameCombat.js)のメソッドをprototypeに合体させて1クラスとして扱う。
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

  setPlayers(players) {
    this.players = players;
    if (this.isHost) this.botAI.setBots(players.filter((p) => p.is_bot));
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
      const dz = -(moveX * sin + moveZ * cos) * speed * dt;
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

Object.assign(Game.prototype, phaseMethods, networkMethods, combatMethods, hudMethods);
