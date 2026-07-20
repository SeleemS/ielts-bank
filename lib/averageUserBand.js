const BASE_BAND_BY_DIFFICULTY = {
  easy: 6.5,
  medium: 5.5,
  hard: 4.5,
};

function stableVariant(value) {
  let hash = 2166136261;
  for (const char of String(value || 'ielts-bank')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 3;
}

// Safe rollout fallback while the database migration is being applied. The
// migration stores its own deterministic difficulty-correlated seed; once that
// column is available, the stored value always wins.
export function estimatedAverageUserBand(id, difficulty) {
  const normalizedDifficulty = String(difficulty || 'medium').toLowerCase();
  const base = BASE_BAND_BY_DIFFICULTY[normalizedDifficulty] ?? BASE_BAND_BY_DIFFICULTY.medium;
  return base + stableVariant(id) * 0.5;
}

export function resolveAverageUserBand({
  id,
  difficulty,
  averageUserBand,
  submissionCount,
}) {
  const count = Number.isFinite(Number(submissionCount))
    ? Math.max(0, Number(submissionCount))
    : 0;
  const stored = averageUserBand == null ? null : Number(averageUserBand);
  const hasStoredBand = Number.isFinite(stored) && stored >= 0 && stored <= 9;

  return {
    value: hasStoredBand ? stored : estimatedAverageUserBand(id, difficulty),
    isEstimated: count === 0,
    submissionCount: count,
  };
}

export function formatAverageUserBand(value) {
  return Number(value).toFixed(1);
}
