// ゲーム開始・フェーズ進行・ラウンド終了・ロビー復帰など、部屋のライフサイクル操作。
import { supabase } from './supabaseClient.js';
import { fetchRoomPlayers } from './rooms.js';

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

// ホストが待機画面からカメレオン(隠れる側)人数をその場で調整する(部屋の作り直し不要)
export async function updateHiderCount(roomId, hiderCount) {
  await supabase.from('mc_rooms').update({ hider_count: hiderCount, updated_at: new Date().toISOString() }).eq('id', roomId);
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
