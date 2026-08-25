// ログイン/新規登録/ゲスト参加/プロフィール表示まわりのUI配線。
import { initAuth, onAuthChange, signInWithEmail, signUpWithEmail, signInAsGuest, signOut, updateDisplayName } from './auth.js';
import { rankTierForWins, nextRankThreshold } from './config.js';
import { joinRoomByCode } from './rooms.js';
import { $, state, showScreen } from './appState.js';
import { enterRoom } from './roomUI.js';

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

function translateAuthError(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'メールアドレスまたはパスワードが間違っています';
  if (/User already registered/i.test(msg)) return 'このメールアドレスは既に登録されています';
  if (/Email not confirmed/i.test(msg)) return 'メール確認がまだ完了していません(管理者に設定解除を依頼してください)';
  if (/Anonymous sign-ins? (is|are) disabled/i.test(msg)) return 'ゲスト参加が管理者側でまだ有効化されていません';
  return msg;
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

$('#btn-guest').addEventListener('click', () => withLoading($('#btn-guest'), '参加中…', async () => {
  try {
    await signInAsGuest($('#guest-name').value);
  } catch (e) {
    setAuthMessage('ゲスト参加に失敗しました: ' + translateAuthError(e.message), true);
  }
}));

$('#btn-logout').addEventListener('click', () => signOut());
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
onAuthChange((user, profile) => {
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
