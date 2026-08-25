// ロビー画面(部屋作成/コード参加/野良一覧/ランキング)のUI配線。
import { createRoom, joinRoomByCode, listPublicRooms } from './rooms.js';
import { rankTierForWins } from './config.js';
import { fetchLeaderboard } from './rank.js';
import { $, escapeHtml } from './appState.js';
import { enterRoom } from './roomUI.js';

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
    await enterRoom(room.id, room.code);
  } catch (e) {
    alert('部屋を作成できませんでした: ' + e.message);
  }
});

// ============ コードで参加 ============
$('#btn-join-code').addEventListener('click', async () => {
  try {
    const room = await joinRoomByCode($('#join-code-input').value);
    await enterRoom(room.id, room.code);
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
        try { const room = await joinRoomByCode(r.code); await enterRoom(room.id, room.code); }
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
