// 部屋の作成・参加・退出など基本CRUD。ボット操作はroomBots.js、
// ゲーム進行はroomLifecycle.jsに分割し、ここから再エクスポートして呼び出し側の import 先を統一する。
import { supabase } from './supabaseClient.js';
import { getUser, getProfile } from './auth.js';

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字は除外
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
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

  // 既にその部屋のメンバーなら(F5リロード等での再入室)、満員/進行中チェックは無視して
  // 自分の座席にそのまま戻す。新規参加者だけを人数・状態でブロックする。
  const user = getUser();
  const { data: existing } = await supabase
    .from('mc_room_players')
    .select('user_id')
    .eq('room_id', room.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    if (room.status !== 'waiting') throw new Error('その部屋はすでにゲーム中です');
    const { count } = await supabase
      .from('mc_room_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);
    if ((count ?? 0) >= room.max_players) throw new Error('その部屋は満員です');
  }

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

export { addBot, removeBot } from './roomBots.js';
export { startGame, updateHiderCount, endRound, backToLobby, advancePhase } from './roomLifecycle.js';
