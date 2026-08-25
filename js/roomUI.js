// 部屋待機画面〜ゲーム画面へのマウント・部屋状態の描画を担当。
import { leaveRoom, setReady, fetchRoomPlayers, fetchRoom, startGame, subscribeRoom, addBot, removeBot, updateHiderCount } from './rooms.js';
import { GAME_CONFIG } from './config.js';
import { mountChat } from './chatUI.js';
import { getUser } from './auth.js';
import { Game } from './game/game.js';
import { $, state, screens, showScreen, resetState, escapeHtml } from './appState.js';

export async function enterRoom(roomId, code) {
  state.roomId = roomId;
  if (code) localStorage.setItem('mc_active_room_code', code);
  showScreen('room');
  state.roomChat = mountChat($('#room-chat-root'), roomId);
  await refreshRoomView();
  state.unsubRoom = subscribeRoom(roomId, {
    onRoomChange: (room) => onRoomUpdate(room),
    onPlayersChange: () => refreshRoomPlayers(),
  });
}

async function refreshRoomView() {
  const room = await fetchRoom(state.roomId);
  if (!room) { leaveCurrentRoom(); return; }
  state.room = room;
  await refreshRoomPlayers();
  renderRoomHeader();
  if (room.status !== 'waiting') mountGameIfNeeded();
}

async function refreshRoomPlayers() {
  state.players = await fetchRoomPlayers(state.roomId);
  renderRoomPlayers();
  state.game?.setPlayers(state.players);
}

async function onRoomUpdate(room) {
  const wasWaiting = state.room?.status === 'waiting' || !state.room;
  state.room = room;
  renderRoomHeader();
  if (room.status === 'waiting' && state.game) {
    // ロビーに戻った(次ラウンド前の待機)
    state.game.destroy();
    state.game = null;
    showScreen('room');
    state.roomChat = mountChat($('#room-chat-root'), state.roomId);
    return;
  }
  if (room.status !== 'waiting') {
    // 待機→隠れフェーズの瞬間は役割(role)がまだ届いていない可能性があるので先に最新を取得
    if (wasWaiting) await refreshRoomPlayers();
    mountGameIfNeeded();
    state.game?.setPhase(room);
  }
}

function mountGameIfNeeded() {
  if (state.game) return;
  showScreen('game');
  state.roomChat?.destroy(); // ゲーム画面側のチャットに一本化
  state.roomChat = null;
  state.game = new Game({
    container: $('#game-canvas-root'),
    uiRoot: $('#game-ui-root'),
    room: state.room,
    players: state.players,
  });
  state.game.setPhase(state.room);
}

function renderRoomHeader() {
  const r = state.room;
  if (!r) return;
  $('#room-code-display').textContent = r.code;
  $('#room-name-display').textContent = r.name;
  $('#room-share-url').value = `${location.origin}${location.pathname}?code=${r.code}`;
  const isHost = r.host_id === getUser()?.id;
  $('#btn-start-game').classList.toggle('hidden', !isHost);
  $('#room-host-settings').classList.toggle('hidden', !isHost);
  $('#room-hider-count-live').textContent = r.hider_count;
  const total = Math.max(state.players.length, 1);
  $('#hider-count-hint').textContent = `(参加者${total}人 / 鬼${Math.max(total - r.hider_count, 0)}人)`;
  $('#btn-add-bot').classList.toggle('hidden', !isHost || state.players.length >= r.max_players);
}

function renderRoomPlayers() {
  const list = $('#room-player-list');
  list.innerHTML = '';
  const isHost = state.room?.host_id === getUser()?.id;
  for (const p of state.players) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const label = `${p.is_host ? '👑 ' : ''}${p.is_bot ? '🤖 ' : ''}${escapeHtml(p.display_name)}`;
    const rightBit = p.is_bot
      ? (isHost ? '<button class="btn-small bot-remove-btn">外す</button>' : '<span class="muted">CPU</span>')
      : `<span class="muted">${p.ready ? '準備OK' : ''}</span>`;
    row.innerHTML = `<div>${label}</div><div>${rightBit}</div>`;
    if (p.is_bot && isHost) {
      row.querySelector('.bot-remove-btn').addEventListener('click', () => removeBot(state.roomId, p.user_id));
    }
    list.appendChild(row);
  }
  $('#room-player-count').textContent = `${state.players.length}人`;
  const me = state.players.find((p) => p.user_id === getUser()?.id);
  $('#btn-ready').textContent = me?.ready ? '準備解除' : '準備OK';
  $('#btn-start-game').disabled = state.players.length < GAME_CONFIG.minPlayersToStart;
  if (state.room) $('#btn-add-bot').classList.toggle('hidden', !isHost || state.players.length >= state.room.max_players);
}

export async function leaveCurrentRoom() {
  if (state.roomId) await leaveRoom(state.roomId);
  localStorage.removeItem('mc_active_room_code');
  state.unsubRoom?.();
  state.game?.destroy();
  state.roomChat?.destroy();
  resetState();
  showScreen('lobby');
}

$('#btn-hider-minus').addEventListener('click', () => {
  if (!state.room) return;
  updateHiderCount(state.roomId, Math.max(1, state.room.hider_count - 1));
});
$('#btn-hider-plus').addEventListener('click', () => {
  if (!state.room) return;
  const cap = Math.max(1, state.players.length - 1);
  updateHiderCount(state.roomId, Math.min(cap, state.room.hider_count + 1));
});

$('#btn-ready').addEventListener('click', async () => {
  const me = state.players.find((p) => p.user_id === getUser()?.id);
  await setReady(state.roomId, !me?.ready);
});

$('#btn-add-bot').addEventListener('click', async () => {
  if (!state.room || state.players.length >= state.room.max_players) return;
  try { await addBot(state.room, state.players); }
  catch (e) { alert('ボットを追加できませんでした: ' + e.message); }
});

$('#btn-start-game').addEventListener('click', async () => {
  if (state.players.length < GAME_CONFIG.minPlayersToStart) return;
  await startGame(state.room);
});

$('#btn-leave-room').addEventListener('click', leaveCurrentRoom);
$('#btn-copy-url').addEventListener('click', () => {
  $('#room-share-url').select();
  document.execCommand('copy');
});
