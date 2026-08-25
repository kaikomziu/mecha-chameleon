import { supabase } from './supabaseClient.js';

export async function fetchLeaderboard(limit = 50) {
  const { data, error } = await supabase
    .from('mc_profiles')
    .select('user_id, display_name, wins, losses, hider_wins, hunter_wins, total_games')
    .order('wins', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
