// 擬態の色合わせ判定用の小さなユーティリティ

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 2色の近さを 0(全く違う)〜1(ほぼ同じ) で返す
export function colorSimilarity(rgbA, rgbB) {
  const dist = Math.hypot(rgbA[0] - rgbB[0], rgbA[1] - rgbB[1], rgbA[2] - rgbB[2]);
  const MAX_DIST = 441.67; // sqrt(255^2 * 3)
  return Math.max(0, 1 - dist / MAX_DIST);
}
