import { supabase } from './supabaseClient.js';
import { getUser, getProfile } from './auth.js';

// 部屋(待機中もゲーム中も共通)のテキストチャット。DB保存はせずBroadcastのみ。
export class ChatChannel {
  constructor(roomId) {
    this.roomId = roomId;
    this.channel = supabase.channel(`chat-${roomId}`, { config: { broadcast: { self: true } } });
  }

  onMessage(fn) {
    this.channel.on('broadcast', { event: 'msg' }, ({ payload }) => fn(payload));
    return this;
  }

  onTyping(fn) {
    this.channel.on('broadcast', { event: 'typing' }, ({ payload }) => fn(payload));
    return this;
  }

  sendTyping() {
    const profile = getProfile();
    const user = getUser();
    if (!user) return;
    this.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, name: profile?.display_name || 'プレイヤー' },
    });
  }

  subscribe() {
    return new Promise((resolve) => {
      this.channel.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); });
    });
  }

  send(text) {
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;
    const profile = getProfile();
    this.channel.send({
      type: 'broadcast',
      event: 'msg',
      payload: { userId: getUser()?.id, name: profile?.display_name || 'プレイヤー', text: trimmed, at: Date.now() },
    });
  }

  destroy() {
    supabase.removeChannel(this.channel);
  }
}
