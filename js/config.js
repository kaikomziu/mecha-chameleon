// Supabase接続情報(公開用のpublishable keyなのでクライアントに埋め込んでOK)
export const SUPABASE_URL = 'https://kifnzvktwbomxthzvvgy.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Ea_sHRg6wMwO9YkDTjgOog_stQT1mfq';

// ランク閾値(勝利数)表示用。DB側のmc_rank_tier()と揃えること。
export const RANK_TIERS = [
  { name: 'ブロンズ', min: 0, color: '#a97142' },
  { name: 'シルバー', min: 3, color: '#9aa5b1' },
  { name: 'ゴールド', min: 10, color: '#e0b23b' },
  { name: 'プラチナ', min: 25, color: '#6fd6c9' },
  { name: 'ダイヤモンド', min: 50, color: '#7ab8ff' },
  { name: 'マスター', min: 100, color: '#ff6fae' },
];

export function rankTierForWins(wins) {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (wins >= t.min) tier = t;
  }
  return tier;
}

export function nextRankThreshold(wins) {
  const idx = RANK_TIERS.findIndex((t) => t.min > wins);
  return idx === -1 ? null : RANK_TIERS[idx].min;
}

// ゲームバランス設定
export const GAME_CONFIG = {
  hideSeconds: 45,
  seekSeconds: 90,
  resultsSeconds: 10,
  minPlayersToStart: 2,
  defaultHiderCount: 1,
  maxPlayers: 12,
  winPoints: 10,
};
