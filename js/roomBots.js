// ボット(CPU)の部屋への追加/削除。実アカウントを持たないダミーIDで登録する。
import { supabase } from './supabaseClient.js';

const BOT_NAMES = ['タヌキ', 'ハヤブサ', 'カメレオン', 'ミミズク', 'コウモリ', 'キツネ', 'オオカミ', 'ネコ', 'クマ', 'リス', 'イタチ', 'フクロウ', 'カワウソ', 'ハリネズミ'];

function genBotName(existingNames) {
  const pool = BOT_NAMES.filter((n) => !existingNames.includes(`CPU-${n}`));
  const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 100);
  return `CPU-${name}`;
}

export async function addBot(room, existingPlayers) {
  const botId = crypto.randomUUID();
  const name = genBotName(existingPlayers.map((p) => p.display_name));
  const { error } = await supabase.from('mc_room_players').insert({
    room_id: room.id,
    user_id: botId,
    display_name: name,
    is_bot: true,
    is_host: false,
    ready: true,
    role: null,
    alive: true,
  });
  if (error) throw error;
  return botId;
}

export async function removeBot(roomId, botUserId) {
  await supabase.from('mc_room_players').delete().eq('room_id', roomId).eq('user_id', botUserId).eq('is_bot', true);
}
