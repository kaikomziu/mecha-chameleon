import { supabase } from './supabaseClient.js';

let currentUser = null;
let currentProfile = null;
const listeners = [];

export function onAuthChange(fn) {
  listeners.push(fn);
  if (currentUser !== undefined) fn(currentUser, currentProfile);
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
  // Supabase側の「Confirm email」がオンだと、ここではまだsessionが発行されない
  return { hasSession: !!data.session };
}

export async function signInWithEmail(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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

  supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) await refreshProfile();
    else {
      currentProfile = null;
      emit();
    }
  });
}
