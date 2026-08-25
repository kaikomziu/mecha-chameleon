import { supabase } from './supabaseClient.js';
import { getUser, getProfile } from './auth.js';

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字は除外
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const BOT_NAMES = ['タヌキ', 'ハヤブサ', 'カメレオン', 'ミミズク', 'コウモリ', 'キツネ', 'オオカミ', 'ネコ', 'クマ', 'リス', 'イタチ', 'フクロウ', 'カワウソ', 'ハリネズミ'];
function genBotName(existingNames) {
  const pool = BOT_NAMES.filter((n) => !existingNames.includes(`CPU-${n}`));
  const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 100);
  return `CPU-${name}`;
}

// ホストがボット(CPU)を部屋に追加する。実アカウントを持たないダミーIDで登録。
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

export async function createRoom({ name, isPublic, maxPlayers, hiderCount }) {
  const user = getUser();
  const profile = getProfile();
  if (!user) throw new Error('ログインが必要です');

  let code = genCode();
  // 衝突回避(まず稀だが一応リトライ)
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('mc_rooms').select('id').eq('code', code).maybeSingle();
    if (!data) break;
    code = genCode();
  }

  const { data: room, error } = await supabase
    .from('mc_rooms')
    .insert({
      code,
      name: name?.trim().slice(0, 24) || `${profile?.display_name || 'プレイヤー'}の部屋`,
      is_public: !!isPublic,
      host_id: user.id,
      max_players: maxPlayers,
      hider_count: hiderCount,
      status: 'waiting',
    })
    .select()
    .single();
  if (error) throw error;

  await joinExistingRoom(room.id);
  return room;
}

async function joinExistingRoom(roomId) {
  const user = getUser();
  const profile = getProfile();
  const { data: room } = await supabase.from('mc_rooms').select('host_id').eq('id', roomId).maybeSingle();
  const { error } = await supabase.from('mc_room_players').upsert({
    room_id: roomId,
    user_id: user.id,
    display_name: profile?.display_name || 'プレイヤー',
    is_host: room?.host_id === user.id,
    role: null,
    alive: true,
    ready: false,
  });
  if (error) throw error;
}

export async function joinRoomByCode(code) {
  const normalized = code.trim().toUpperCase();
  const { data: room, error } = await supabase
    .from('mc_rooms')
    .select('*')
    .eq('code', normalized)
    .maybeSingle();
  if (error || !room) throw new Error('その部屋コードは見つかりませんでした');
  if (room.status !== 'waiting') throw new Error('その部屋はすでにゲーム中です');

  const { count } = await supabase
    .from('mc_room_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);
  if ((count ?? 0) >= room.max_players) throw new Error('その部屋は満員です');

  await joinExistingRoom(room.id);
  return room;
}

export async function listPublicRooms() {
  const { data, error } = await supabase
    .from('mc_rooms')
    .select('*, mc_room_players(count)')
    .eq('is_public', true)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

export async function leaveRoom(roomId) {
  const user = getUser();
  if (!user) return;
  await supabase.from('mc_room_players').delete().eq('room_id', roomId).eq('user_id', user.id);
  // ホストが抜けた場合、残っている誰かに引き継ぐ
  const { data: room } = await supabase.from('mc_rooms').select('host_id').eq('id', roomId).maybeSingle();
  if (room && room.host_id === user.id) {
    const { data: remaining } = await supabase
      .from('mc_room_players')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('is_bot', false)
      .limit(1)
      .maybeSingle();
    if (remaining) {
      await supabase.from('mc_rooms').update({ host_id: remaining.user_id }).eq('id', roomId);
      await supabase.from('mc_room_players').update({ is_host: true }).eq('room_id', roomId).eq('user_id', remaining.user_id);
    } else {
      await supabase.from('mc_rooms').delete().eq('id', roomId);
    }
  }
}

export async function setReady(roomId, ready) {
  const user = getUser();
  await supabase.from('mc_room_players').update({ ready }).eq('room_id', roomId).eq('user_id', user.id);
}

export async function fetchRoomPlayers(roomId) {
  const { data, error } = await supabase.from('mc_room_players').select('*').eq('room_id', roomId).order('joined_at');
  if (error) throw error;
  return data;
}

export async function fetchRoom(roomId) {
  const { data, error } = await supabase.from('mc_rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  return data;
}

// ホストがゲーム開始: カメレオン(隠れる側)をランダムに選出してフェーズを進める
export async function startGame(room) {
  const players = await fetchRoomPlayers(room.id);
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const hiderCount = Math.min(room.hider_count, Math.max(1, players.length - 1));
  const hiderIds = new Set(shuffled.slice(0, hiderCount).map((p) => p.user_id));

  await Promise.all(
    players.map((p) =>
      supabase
        .from('mc_room_players')
        .update({ role: hiderIds.has(p.user_id) ? 'hider' : 'hunter', alive: true })
        .eq('room_id', room.id)
        .eq('user_id', p.user_id)
    )
  );

  const endsAt = new Date(Date.now() + 45000).toISOString();
  await supabase
    .from('mc_rooms')
    .update({ status: 'hiding', round_no: (room.round_no || 0) + 1, phase_ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq('id', room.id);
}

// ラウンド終了(ホストのみ呼び出す想定): 勝敗を記録し結果フェーズへ
export async function endRound(room, winnerSide, players) {
  const endsAt = new Date(Date.now() + 10000).toISOString();
  await supabase
    .from('mc_rooms')
    .update({ status: 'results', winner_side: winnerSide, phase_ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq('id', room.id);

  await supabase.from('mc_game_results').insert({
    room_id: room.id,
    winner_side: winnerSide,
    participants: players.map((p) => ({ user_id: p.user_id, display_name: p.display_name, role: p.role, alive: p.alive })),
  });
}

export async function backToLobby(roomId) {
  await supabase
    .from('mc_rooms')
    .update({ status: 'waiting', winner_side: null, phase_ends_at: null, updated_at: new Date().toISOString() })
    .eq('id', roomId);
  const { data: players } = await supabase.from('mc_room_players').select('user_id').eq('room_id', roomId);
  if (players) {
    await Promise.all(
      players.map((p) => supabase.from('mc_room_players').update({ role: null, alive: true, ready: false }).eq('room_id', roomId).eq('user_id', p.user_id))
    );
  }
}

export async function advancePhase(roomId, nextStatus, durationSec) {
  const endsAt = durationSec ? new Date(Date.now() + durationSec * 1000).toISOString() : null;
  await supabase
    .from('mc_rooms')
    .update({ status: nextStatus, phase_ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq('id', roomId);
}

export function subscribeRoom(roomId, { onRoomChange, onPlayersChange }) {
  const channel = supabase
    .channel(`room-db-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mc_rooms', filter: `id=eq.${roomId}` }, (payload) => {
      onRoomChange?.(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mc_room_players', filter: `room_id=eq.${roomId}` }, () => {
      onPlayersChange?.();
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}
