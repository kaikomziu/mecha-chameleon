import { supabase } from './supabaseClient.js';

let currentUser = null;
let currentProfile = null;
const listeners = [];
const recoveryListeners = [];

export function onAuthChange(fn) {
  listeners.push(fn);
  if (currentUser !== undefined) fn(currentUser, currentProfile);
}

// パスワード再設定リンクを開いた直後(PASSWORD_RECOVERYイベント)に呼ばれる
export function onPasswordRecovery(fn) {
  recoveryListeners.push(fn);
}

function emit() {
  for (const fn of listeners) fn(currentUser, currentProfile);
}

export function getUser() {
  return currentUser;
}

export function getProfile() {
  return currentProfile;
}

export async function signUpWithEmail(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: displayName?.trim().slice(0, 16) || 'プレイヤー' } },
  });
  if (error) throw error;
  // メール確認が必須な設定の場合、sessionはまだ発行されない
  return { needsEmailConfirm: !data.session };
}

export async function signInWithEmail(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function resetPassword(email) {
  const redirectTo = window.location.href.split('#')[0].split('?')[0];
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// 日本の電話番号入力(090xxxxxxxx等)をE.164形式(+8190xxxxxxxx)に変換
export function toE164JP(input) {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return '+81' + digits.slice(1);
  if (digits.startsWith('81')) return '+' + digits;
  return '+81' + digits;
}

// SMS認証コードを送信(未登録の番号なら自動的にアカウントも作成される)
export async function sendPhoneOtp(phoneInput) {
  const phone = toE164JP(phoneInput);
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return phone;
}

export async function verifyPhoneOtp(phoneE164, code) {
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code.trim(), type: 'sms' });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
  emit();
}

export async function refreshProfile() {
  if (!currentUser) return null;
  const { data, error } = await supabase
    .from('mc_profiles')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  if (error) {
    console.error('プロフィール取得失敗', error);
    return null;
  }
  // トリガーがまだ発火していない場合に備えて保険でupsert
  if (!data) {
    const { data: created } = await supabase
      .from('mc_profiles')
      .upsert({ user_id: currentUser.id, display_name: currentUser.user_metadata?.name || 'プレイヤー' })
      .select()
      .maybeSingle();
    currentProfile = created;
  } else {
    currentProfile = data;
  }
  emit();
  return currentProfile;
}

export async function updateDisplayName(name) {
  if (!currentUser) return;
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed) return;
  const { data, error } = await supabase
    .from('mc_profiles')
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq('user_id', currentUser.id)
    .select()
    .maybeSingle();
  if (!error) {
    currentProfile = data;
    emit();
  }
}

export async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;
  if (currentUser) await refreshProfile();
  else emit();

  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user ?? null;
    if (event === 'PASSWORD_RECOVERY') {
      for (const fn of recoveryListeners) fn();
    }
    if (currentUser) await refreshProfile();
    else {
      currentProfile = null;
      emit();
    }
  });
}
