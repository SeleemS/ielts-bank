export const STUDYING_NOW_MIN = 10;
export const STUDYING_NOW_MAX = 50;

function clampCount(value) {
  return Math.min(
    STUDYING_NOW_MAX,
    Math.max(STUDYING_NOW_MIN, Math.round(Number(value) || STUDYING_NOW_MIN))
  );
}

// Stable first paint for a given minute. Once mounted, the badge persists its
// small random walk in sessionStorage so client-side navigation never causes a
// suspicious jump.
export function initialStudyingNowCount(timestamp) {
  const minuteBucket = Math.floor(Number(timestamp || 0) / 60000);
  return STUDYING_NOW_MIN + ((minuteBucket * 17 + 23) % 41);
}

// Concurrent learner counts usually pause or move by one, with occasional
// two-person changes. Near the bounds, gently bias the walk back toward the
// middle instead of visibly bouncing off 10 or 50.
export function nextStudyingNowCount(current, random = Math.random) {
  const count = clampCount(current);
  const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
  let step;

  if (count <= STUDYING_NOW_MIN + 3) {
    step = roll < 0.15 ? 0 : roll < 0.8 ? 1 : 2;
  } else if (count >= STUDYING_NOW_MAX - 3) {
    step = roll < 0.2 ? -2 : roll < 0.85 ? -1 : 0;
  } else if (roll < 0.08) {
    step = -2;
  } else if (roll < 0.34) {
    step = -1;
  } else if (roll < 0.66) {
    step = 0;
  } else if (roll < 0.92) {
    step = 1;
  } else {
    step = 2;
  }

  return clampCount(count + step);
}

export function nextStudyingNowDelay(random = Math.random) {
  const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
  return 25000 + Math.floor(roll * 30001);
}
