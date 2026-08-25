// 画面遷移・共有状態など、複数のUIモジュールから参照される最小限の共通部分。
export const $ = (sel, root = document) => root.querySelector(sel);

export const screens = {
  auth: $('#screen-auth'),
  lobby: $('#screen-lobby'),
  room: $('#screen-room'),
  game: $('#screen-game'),
};

export function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
}

// 現在の部屋・ゲームの状態。reassignすると他モジュールのimport参照が壊れるため、
// 中身を書き換えるときは必ず Object.assign(state, {...}) か個別プロパティ代入を使う。
export const state = {
  roomId: null,
  room: null,
  players: [],
  unsubRoom: null,
  game: null,
  roomChat: null,
};

export function resetState() {
  Object.assign(state, { roomId: null, room: null, players: [], unsubRoom: null, game: null, roomChat: null });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
