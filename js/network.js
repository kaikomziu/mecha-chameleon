// ゲーム中の高頻度データ(位置・視点・ペイント・発砲・投票)はDBを介さず
// Supabase Realtime の Broadcast + Presence でやり取りする(低遅延・DB負荷ゼロ)。
import { supabase } from './supabaseClient.js';
import { getUser, getProfile } from './auth.js';

export class GameChannel {
  constructor(roomId) {
    this.roomId = roomId;
    this.channel = supabase.channel(`room-game-${roomId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: getUser()?.id } },
    });
    this._handlers = {};
  }

  on(event, fn) {
    this._handlers[event] = fn;
    this.channel.on('broadcast', { event }, ({ payload }) => fn(payload));
    return this;
  }

  onPresence(fn) {
    this.channel.on('presence', { event: 'sync' }, () => {
      fn(this.channel.presenceState());
    });
    return this;
  }

  async subscribe() {
    return new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const profile = getProfile();
          await this.channel.track({
            user_id: getUser()?.id,
            name: profile?.display_name || 'プレイヤー',
            online_at: Date.now(),
          });
          resolve();
        }
      });
    });
  }

  send(event, payload) {
    this.channel.send({ type: 'broadcast', event, payload });
  }

  destroy() {
    supabase.removeChannel(this.channel);
  }
}

// 送信頻度を間引くためのシンプルなスロットル
export function throttle(fn, ms) {
  let last = 0;
  let pendingArgs = null;
  let timer = null;
  return (...args) => {
    const now = performance.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else {
      pendingArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = performance.now();
          if (pendingArgs) fn(...pendingArgs);
          pendingArgs = null;
        }, ms - (now - last));
      }
    }
  };
}
