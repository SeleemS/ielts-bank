// src/lib/freeAttempts.js
// Anonymous free-tier gate: signed-out visitors get ONE question submission
// per skill (reading / listening) before we ask them to create a free
// account. We remember WHICH question consumed the free slot so retrying
// the same question stays free — only a *different* question triggers the
// sign-up gate. Writing and Speaking don't use this gate: since 2026-07-18
// their AI scoring is Premium-only from the first attempt (sign-up + upgrade
// gates live in the pages and are enforced server-side).
//
// This is a soft client-side gate (localStorage). Reading/listening grade
// client-side, so clearing storage resets the slot — acceptable, the goal is
// signup conversion, not hard enforcement.

const KEY = 'ielts-free-submits';

function read() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// True when a signed-out visitor may still submit `slug` for `skill`: the
// skill's free slot is unused, or it was used on this same question.
export function canUseFreeSubmit(skill, slug) {
  if (!skill) return true;
  const used = read()[skill];
  return !used || used === slug;
}

export function recordFreeSubmit(skill, slug) {
  if (!skill || !slug || typeof window === 'undefined') return;
  try {
    const map = read();
    if (!map[skill]) {
      map[skill] = slug;
      window.localStorage.setItem(KEY, JSON.stringify(map));
    }
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}
