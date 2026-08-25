// Gameクラスの「発砲・投票スキップ・タイムアウト解決」まわりのメソッド群。
import * as THREE from 'https://esm.sh/three@0.160.0';
import { endRound, advancePhase } from '../rooms.js';

export const combatMethods = {
  // ============ 発砲 ============
  _attemptShoot() {
    if (this.room.status !== 'seeking' || this.myRole !== 'hunter') return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    // 部屋の対角線(26x26想定で約37)より少し余裕を持たせて、遠くの的も撃ち漏らさないように
    const hits = ray.intersectObjects(this.scene.children, true).filter((h) => h.distance < 50);
    if (!hits.length) { this._flashHit(false); return; }
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
  },

  _flashHit(success) {
    const el = this.hud.querySelector('.hit-flash');
    el.style.background = success ? 'rgba(255,80,60,0.35)' : 'rgba(255,255,255,0.12)';
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 120);
  },

  // ============ 投票スキップ ============
  _castVoteSkip() {
    if (this.votedSkip.has(this.myId)) return;
    this.votedSkip.add(this.myId);
    this._updateVoteButton();
    this.channel.send('vote_skip', { userId: this.myId });
    this._maybeSkipPhase();
  },
  _onVoteSkip(p) {
    this.votedSkip.add(p.userId);
    this._updateVoteButton();
    if (this.isHost) this._maybeSkipPhase();
  },
  _updateVoteButton() {
    const total = this.players.filter((p) => !p.is_bot).length || 1; // CPUは投票に数えない
    this.hud.querySelector('.hud-vote-skip').textContent = `もうええよ (${this.votedSkip.size}/${total})`;
  },
  _maybeSkipPhase() {
    if (!this.isHost) return;
    const total = this.players.filter((p) => !p.is_bot).length || 1;
    if (this.votedSkip.size > total / 2) this._resolvePhaseEnd();
  },

  // ============ ホスト: タイムアウト解決 ============
  _resolvePhaseEnd() {
    if (!this.isHost) return;
    if (this.room.status === 'hiding') {
      advancePhase(this.room.id, 'seeking', 90);
    } else if (this.room.status === 'seeking') {
      endRound(this.room, this.aliveHiders.size > 0 ? 'hider' : 'hunter', this.players);
    }
  },
};
