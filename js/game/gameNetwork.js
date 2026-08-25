// Gameクラスの「ネットワーク受信・擬態判定・CPUブロードキャスト橋渡し」まわりのメソッド群。
import * as THREE from 'https://esm.sh/three@0.160.0';
import { Character } from './character.js';
import { nearestBackgroundColor } from './world.js';
import { hexToRgb, colorSimilarity } from './colorUtils.js';
import { supabase } from '../supabaseClient.js';
import { endRound } from '../rooms.js';

const HUNTER_COLOR = '#e8622c';

export const networkMethods = {
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
  },

  _removeRemote(r) {
    this.scene.remove(r.group);
    r.character?.dispose();
  },

  _onRemotePos(p) {
    if (p.userId === this.myId) return;
    const r = this._ensureRemote(p.userId, p.role);
    r.target.x = p.x; r.target.z = p.z; r.target.yaw = p.yaw || 0;
    if (r.character && p.pose && r.character.pose !== p.pose) r.character.setPose(p.pose);
  },

  _onRemotePaint(p) {
    if (p.userId === this.myId) return;
    const r = this._ensureRemote(p.userId, 'hider');
    r.character?.applyPaintDataURL(p.dataUrl, () => this._updateCamouflage(r, p.x, p.z));
    if (p.pose) r.character.setPose(p.pose);
    r.target.x = p.x; r.target.z = p.z;
    r.group.position.set(p.x, 0, p.z);
  },

  // 塗った色と、その場所の家具・床の色がどれだけ近いかを0〜1で評価してボットの索敵速度に反映する
  _updateCamouflage(r, x, z) {
    if (!r.character) return;
    if (!r.character.painted) { r.camouflage = 0; return; } // 何も塗っていなければ丸見え扱い
    const bgRgb = hexToRgb(nearestBackgroundColor(x, z, this.world));
    r.camouflage = colorSimilarity(r.character.getAverageColor(), bgRgb);
  },

  _onHiderFound(p) {
    this._applyHiderFound(p.targetUserId);
  },

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
  },

  // ============ CPU用ブロードキャスト橋渡し(ホストのみ) ============
  // self:false のBroadcastは送信者自身には返ってこないため、ホストの画面にも
  // ボットを映すには送信と同時にローカルにも同じ処理を直接適用する。
  _botSendPos(payload) {
    this.channel.send('pos', payload);
    this._onRemotePos(payload);
  },
  _botSendPaint(payload) {
    this.channel.send('paint', payload);
    this._onRemotePaint(payload);
  },
  _botTriggerFound(targetUserId, byBotId) {
    this.channel.send('hider_found', { targetUserId, by: byBotId });
    this._applyHiderFound(targetUserId);
  },
  *_aliveHiderPositions() {
    for (const id of this.aliveHiders) {
      const r = this.remote.get(id);
      if (r) yield [id, { x: r.target.x, z: r.target.z, camouflage: r.camouflage ?? 0 }];
    }
  },

  _updateAliveHUD() {
    const el = this.hud.querySelector('.hud-alive');
    if (this.myRole === 'hunter' && this.room.status === 'seeking') {
      el.textContent = `残り隠れ人数: ${this.aliveHiders.size}`;
    } else {
      el.textContent = '';
    }
  },
};
