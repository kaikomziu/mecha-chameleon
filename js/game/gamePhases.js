// Gameクラスの「フェーズ遷移」まわりのメソッド群。Object.assign(Game.prototype, phaseMethods) で合体する。
import * as THREE from 'https://esm.sh/three@0.160.0';
import { POSES } from './character.js';
import { supabase } from '../supabaseClient.js';
import { endRound, backToLobby } from '../rooms.js';
import { refreshProfile } from '../auth.js';

export const phaseMethods = {
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
  },

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
  },

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
  },

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
  },

  _setOverlay(text) {
    const el = this.hud.querySelector('.hud-overlay');
    const inner = this.hud.querySelector('.hud-overlay-inner');
    if (!text) { el.classList.add('hidden'); return; }
    inner.textContent = text;
    el.classList.remove('hidden');
  },

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
  },

  _closePaintMode() {
    this.paintMode = false;
    this.paintController.hide();
    this.scene.remove(this.character.group);
    if (this.room.status === 'hiding' && this.myRole === 'hider') this.controls.setEnabled(true);
    this._sendPaintSnapshot();
  },

  _sendPaintSnapshot() {
    this.channel.send('paint', {
      userId: this.myId,
      dataUrl: this.character.exportPaintDataURL(),
      pose: this.character.pose,
      x: this.pos.x, z: this.pos.z,
    });
  },

  _sendPosNow() {
    this.channel.send('pos', {
      userId: this.myId, role: this.myRole,
      x: this.pos.x, z: this.pos.z, yaw: this.controls.yaw, pose: this.character.pose,
    });
  },
};
