import { Character, POSES } from './character.js';
import { resolveCollisions, randomSpawnPoint, hasLineOfSight } from './world.js';

const PLAYER_RADIUS = 0.38;
const HIDER_PAINT_COLORS = ['#8a5a34', '#5b3a20', '#cfd3d6', '#a9adb0', '#3d6b8a', '#8a3d3d', '#8a8f96', '#c9cdd2', '#4b7a3a', '#e7e2d6'];
const POSE_KEYS = Object.keys(POSES);

// ホストのクライアント上で「CPU」プレイヤーの動き・擬態・索敵を丸ごとシミュレートする。
// 生成した行動はGame側のコールバック経由で本物のプレイヤーと全く同じプロトコル(pos/paint/hider_found)で
// ブロードキャストされるため、他のクライアントからはCPUかどうか区別する特別なコードが要らない。
export class BotAI {
  constructor({ world, sendPos, sendPaint, triggerFound }) {
    this.world = world;
    this.sendPos = sendPos;
    this.sendPaint = sendPaint;
    this.triggerFound = triggerFound;
    this.states = new Map(); // userId -> ランタイム状態
  }

  setBots(botPlayers) {
    const ids = new Set(botPlayers.map((b) => b.user_id));
    for (const id of [...this.states.keys()]) if (!ids.has(id)) this.states.delete(id);
    for (const b of botPlayers) {
      if (!this.states.has(b.user_id)) this.states.set(b.user_id, { userId: b.user_id, x: 0, z: 0 });
      const s = this.states.get(b.user_id);
      s.role = b.role;
      s.alive = b.alive !== false;
    }
  }

  enterHiding() {
    for (const s of this.states.values()) {
      s.character?.dispose?.();
      if (s.role !== 'hider') continue;
      const [x, z] = randomSpawnPoint(this.world);
      s.x = x; s.z = z;
      s.pose = POSE_KEYS[Math.floor(Math.random() * POSE_KEYS.length)];
      s.character = new Character(s.pose);
      const blotches = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < blotches; i++) {
        const color = HIDER_PAINT_COLORS[Math.floor(Math.random() * HIDER_PAINT_COLORS.length)];
        s.character.paintAtUV(Math.random(), Math.random(), color, 14 + Math.random() * 22);
      }
    }
  }

  // 隠れフェーズ終了時: 隠れる側ボットは最終位置とペイントを1回だけ送って静止させる
  enterSeeking() {
    for (const s of this.states.values()) {
      if (s.role === 'hider') {
        if (s.character) {
          this.sendPaint({ userId: s.userId, dataUrl: s.character.exportPaintDataURL(), pose: s.pose, x: s.x, z: s.z });
          this.sendPos({ userId: s.userId, role: 'hider', x: s.x, z: s.z, yaw: 0, pose: s.pose });
          s.character.dispose();
          s.character = null;
        }
      } else if (s.role === 'hunter') {
        const [x, z] = randomSpawnPoint(this.world);
        s.x = x; s.z = z;
        s.waypoint = null;
        s.suspicion = new Map();
        s.speed = 2.6 + Math.random() * 0.9;
        s.detectRadius = 5 + Math.random() * 1.6;
        s.lastSent = 0;
      }
    }
  }

  // aliveHiders: [ [userId, {x,z}], ... ] のイテラブルを返す関数
  tick(dt, now, aliveHiders) {
    const hiderList = [...aliveHiders()];
    for (const s of this.states.values()) {
      if (s.role === 'hunter' && s.alive !== false) this._tickHunter(s, dt, now, hiderList);
    }
  }

  _tickHunter(s, dt, now, hiderList) {
    if (!s.waypoint || Math.hypot(s.waypoint[0] - s.x, s.waypoint[1] - s.z) < 0.6) {
      s.waypoint = randomSpawnPoint(this.world);
    }
    const dx = s.waypoint[0] - s.x, dz = s.waypoint[1] - s.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = s.x + (dx / dist) * s.speed * dt;
    const nz = s.z + (dz / dist) * s.speed * dt;
    const [rx, rz] = resolveCollisions(nx, nz, PLAYER_RADIUS, this.world.colliders);
    s.x = rx; s.z = rz;
    const yaw = Math.atan2(dx, dz);

    if (now - s.lastSent > 140) {
      s.lastSent = now;
      this.sendPos({ userId: s.userId, role: 'hunter', x: s.x, z: s.z, yaw, pose: 'standing' });
    }

    for (const [hiderId, pos] of hiderList) {
      if (hiderId === s.userId) continue;
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      const cur = s.suspicion.get(hiderId) || 0;
      if (d < s.detectRadius && hasLineOfSight(s.x, s.z, pos.x, pos.z, this.world.colliders)) {
        const next = cur + dt;
        if (next > 1.1) {
          s.suspicion.delete(hiderId);
          this.triggerFound(hiderId, s.userId);
        } else {
          s.suspicion.set(hiderId, next);
        }
      } else if (cur > 0) {
        s.suspicion.set(hiderId, Math.max(0, cur - dt * 1.5));
      }
    }
  }

  destroy() {
    for (const s of this.states.values()) s.character?.dispose?.();
    this.states.clear();
  }
}
