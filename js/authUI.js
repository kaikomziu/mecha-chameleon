// ログイン/新規登録/ゲスト参加/プロフィール表示まわりのUI配線。
import { initAuth, onAuthChange, signInAsGuest, signOut, updateDisplayName } from './auth.js';
import { supabase } from './supabaseClient.js';
import { rankTierForWins, nextRankThreshold } from './config.js';
import { joinRoomByCode } from './rooms.js';
import { $, state, showScreen } from './appState.js';
import { enterRoom } from './roomUI.js';

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

function translateAuthError(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'メールアドレスまたはパスワードが間違っています';
  if (/User already registered/i.test(msg)) return 'このメールアドレスは既に登録されています';
  if (/Email not confirmed/i.test(msg)) return 'メール確認がまだ完了していません(管理者に設定解除を依頼してください)';
  if (/Anonymous sign-ins? (is|are) disabled/i.test(msg)) return 'ゲスト参加が管理者側でまだ有効化されていません';
  return msg;
}

// ログインは かるわかGAMESアカウント。以前のメール+パスワードのアカウントは、ログイン後に「引き継ぐ」で紐づけられる(ランク・戦績はそのまま)
const KA_APP = 'mecha-chameleon';
$('#btn-ka-login').addEventListener('click', () => withLoading($('#btn-ka-login'), 'ログイン中…', async () => {
  if (!window.KaAccount) return setAuthMessage('かるわかGAMESアカウントを読み込めませんでした。ページを読み込み直してください', true);
  setAuthMessage('');
  await window.KaAccount.supabaseLogin({ app: KA_APP, supabase, idLabel: 'メールアドレス' });
}));
// ほかのゲームでかるわかGAMESにログイン済みなら、紐づけ済みの場合だけ自動でログインする
if (window.KaAccount) window.KaAccount.supabaseAuto({ app: KA_APP, supabase });

$('#btn-guest').addEventListener('click', () => withLoading($('#btn-guest'), '参加中…', async () => {
  try {
    await signInAsGuest($('#guest-name').value);
  } catch (e) {
    setAuthMessage('ゲスト参加に失敗しました: ' + translateAuthError(e.message), true);
  }
}));

// ログアウトは、かるわかGAMESアカウントからのログアウトも兼ねる
$('#btn-logout').addEventListener('click', async () => { await signOut(); try { await window.KaAccount?.logout(); } catch (e) { /* ignore */ } });
$('#btn-save-name').addEventListener('click', () => updateDisplayName($('#name-input').value));

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

let triedAutoRejoin = false;
// 以前のメール+パスワードでログイン中の人には、かるわかGAMESアカウントへの引き継ぎボタンを出す(ゲストと、すでに引き継いだ人には出さない)
const kaLinkBtn = $('#btn-ka-link');
kaLinkBtn.addEventListener('click', () => window.KaAccount?.supabaseLogin({ app: KA_APP, supabase, idLabel: 'メールアドレス' }));
onAuthChange((user, profile) => {
  kaLinkBtn.classList.toggle('hidden', !user || user.is_anonymous || user.user_metadata?.ka || user.user_metadata?.ka_linked);
  if (!user) { showScreen('auth'); return; }
  if (!state.roomId) {
    showScreen('lobby');
    const savedCode = localStorage.getItem('mc_active_room_code');
    if (savedCode && !triedAutoRejoin) {
      triedAutoRejoin = true;
      joinRoomByCode(savedCode)
        .then((room) => enterRoom(room.id, room.code))
        .catch(() => localStorage.removeItem('mc_active_room_code')); // 部屋が無くなっている等
    }
  }
  if (profile) renderProfile(profile);
});

export { initAuth };
