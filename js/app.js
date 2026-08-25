import { initAuth, onAuthChange, signInWithEmail, signUpWithEmail, signOut, updateDisplayName, getUser } from './auth.js';
import { createRoom, joinRoomByCode, listPublicRooms, leaveRoom, setReady, fetchRoomPlayers, fetchRoom, startGame, subscribeRoom, addBot, removeBot } from './rooms.js';
import { rankTierForWins, nextRankThreshold, GAME_CONFIG } from './config.js';
import { fetchLeaderboard } from './rank.js';
import { Game } from './game/game.js';

const $ = (sel, root = document) => root.querySelector(sel);
const screens = {
  auth: $('#screen-auth'),
  lobby: $('#screen-lobby'),
  room: $('#screen-room'),
  game: $('#screen-game'),
};
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
}

let state = {
  roomId: null,
  room: null,
  players: [],
  unsubRoom: null,
  game: null,
};

// ============ 認証 ============
document.querySelectorAll('.auth-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.auth-pane').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    $('#' + btn.dataset.pane).classList.remove('hidden');
    $('#auth-message').textContent = '';
  });
});

function setAuthMessage(text, isError = false) {
  const el = $('#auth-message');
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

// ボタンの二重送信防止+「押したのに何も起きない」を防ぐローディング表示
async function withLoading(btn, loadingText, fn) {
  if (btn.disabled) return; // 連打防止
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingText;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

$('#btn-login').addEventListener('click', () => withLoading($('#btn-login'), 'ログイン中…', async () => {
  const email = $('#login-email').value, password = $('#login-password').value;
  if (!email || !password) return setAuthMessage('メールアドレスとパスワードを入力してください', true);
  try {
    await signInWithEmail(email, password);
  } catch (e) {
    setAuthMessage('ログインに失敗しました: ' + translateAuthError(e.message), true);
  }
}));

$('#btn-signup').addEventListener('click', () => withLoading($('#btn-signup'), '登録中…', async () => {
  const name = $('#signup-name').value, email = $('#signup-email').value, password = $('#signup-password').value;
  if (!email || !password) return setAuthMessage('メールアドレスとパスワードを入力してください', true);
  if (password.length < 6) return setAuthMessage('パスワードは6文字以上にしてください', true);
  try {
    const { hasSession } = await signUpWithEmail(email, password, name);
    if (hasSession) return; // onAuthChangeが自動でロビーへ遷移させる
    setAuthMessage('登録はできましたが、まだログインできません(管理者にメール確認の解除を依頼してください)', true);
  } catch (e) {
    setAuthMessage('登録に失敗しました: ' + translateAuthError(e.message), true);
  }
}));

function translateAuthError(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'メールアドレスまたはパスワードが間違っています';
  if (/User already registered/i.test(msg)) return 'このメールアドレスは既に登録されています';
  if (/Email not confirmed/i.test(msg)) return 'メール確認がまだ完了していません(管理者に設定解除を依頼してください)';
  return msg;
}

$('#btn-logout').addEventListener('click', () => signOut());

onAuthChange((user, profile) => {
  if (!user) { showScreen('auth'); return; }
  if (!state.roomId) showScreen('lobby');
  if (profile) renderProfile(profile);
});

function renderProfile(profile) {
  const tier = rankTierForWins(profile.wins);
  const next = nextRankThreshold(profile.wins);
  $('#profile-name').textContent = profile.display_name;
  $('#profile-rank-badge').textContent = tier.name;
  $('#profile-rank-badge').style.background = tier.color;
  $('#profile-stats').textContent = `${profile.wins}勝 ${profile.losses}敗 (隠れ${profile.hider_wins}勝 / 鬼${profile.hunter_wins}勝)`;
  $('#profile-next-rank').textContent = next ? `次のランクまであと ${next - profile.wins}勝` : '最高ランク到達!';
  $('#name-input').value = profile.display_name;
}

$('#btn-save-name').addEventListener('click', () => updateDisplayName($('#name-input').value));

// ============ ロビー: タブ切り替え ============
document.querySelectorAll('.lobby-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lobby-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.lobby-pane').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    $('#' + btn.dataset.pane).classList.remove('hidden');
    if (btn.dataset.pane === 'pane-public') refreshPublicRooms();
    if (btn.dataset.pane === 'pane-rank') refreshLeaderboard();
  });
});

// ============ 部屋作成 ============
$('#create-max').addEventListener('input', (e) => {
  $('#create-max-val').textContent = e.target.value;
  $('#create-hiders').max = Math.max(1, Number(e.target.value) - 1);
  if (Number($('#create-hiders').value) > Number($('#create-hiders').max)) $('#create-hiders').value = $('#create-hiders').max;
  $('#create-hiders-val').textContent = $('#create-hiders').value;
});
$('#create-hiders').addEventListener('input', (e) => $('#create-hiders-val').textContent = e.target.value);

$('#btn-create-room').addEventListener('click', async () => {
  try {
    const room = await createRoom({
      name: $('#create-name').value,
      isPublic: $('#create-public').checked,
      maxPlayers: Number($('#create-max').value),
      hiderCount: Number($('#create-hiders').value),
    });
    await enterRoom(room.id);
  } catch (e) {
    alert('部屋を作成できませんでした: ' + e.message);
  }
});

// ============ コードで参加 ============
$('#btn-join-code').addEventListener('click', async () => {
  try {
    const room = await joinRoomByCode($('#join-code-input').value);
    await enterRoom(room.id);
  } catch (e) {
    alert(e.message);
  }
});

// URLに ?code=XXXXX があれば自動入力
const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) $('#join-code-input').value = urlCode.toUpperCase();

// ============ 野良(パブリック)一覧 ============
$('#btn-refresh-public').addEventListener('click', refreshPublicRooms);
async function refreshPublicRooms() {
  const list = $('#public-room-list');
  list.textContent = '読み込み中…';
  try {
    const rooms = await listPublicRooms();
    list.innerHTML = '';
    if (!rooms.length) { list.textContent = '現在オープンな野良部屋はありません'; return; }
    for (const r of rooms) {
      const count = r.mc_room_players?.[0]?.count ?? 0;
      const row = document.createElement('div');
      row.className = 'room-row';
      row.innerHTML = `<div><b>${escapeHtml(r.name)}</b><span class="muted"> ${count}/${r.max_players}人</span></div>
        <button class="btn-small">参加</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        try { const room = await joinRoomByCode(r.code); await enterRoom(room.id); }
        catch (e) { alert(e.message); }
      });
      list.appendChild(row);
    }
  } catch (e) {
    list.textContent = '読み込みに失敗しました';
  }
}

// ============ ランキング ============
async function refreshLeaderboard() {
  const list = $('#leaderboard-list');
  list.textContent = '読み込み中…';
  try {
    const rows = await fetchLeaderboard();
    list.innerHTML = '';
    rows.forEach((p, i) => {
      const tier = rankTierForWins(p.wins);
      const row = document.createElement('div');
      row.className = 'room-row';
      row.innerHTML = `<div>#${i + 1} <b>${escapeHtml(p.display_name)}</b>
        <span class="rank-badge-sm" style="background:${tier.color}">${tier.name}</span></div>
        <div class="muted">${p.wins}勝 ${p.losses}敗</div>`;
      list.appendChild(row);
    });
    if (!rows.length) list.textContent = 'まだ記録がありません';
  } catch (e) {
    list.textContent = '読み込みに失敗しました';
  }
}

// ============ 部屋(待機room) ============
async function enterRoom(roomId) {
  state.roomId = roomId;
  showScreen('room');
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

async function leaveCurrentRoom() {
  if (state.roomId) await leaveRoom(state.roomId);
  state.unsubRoom?.();
  state.game?.destroy();
  state = { roomId: null, room: null, players: [], unsubRoom: null, game: null };
  showScreen('lobby');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ 起動 ============
initAuth();
