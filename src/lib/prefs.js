// src/lib/prefs.js
// Per-user UI preference helpers (e.g. "don't show the listening intro again").
//
// Storage strategy:
//   * Logged-out users -> localStorage only (key `ielts-pref:<name>`).
//   * Signed-in users  -> the jsonb `prefs` column on their public.users row
//     (migration 20260717140000), mirrored into localStorage so later visits
//     resolve instantly without a network round-trip.
//
// Everything FAILS SOFT: a storage or network error must never break the page —
// the worst outcome is an intro modal showing one extra time.

import { getSupabase } from '../../lib/supabase';

const LOCAL_PREFIX = 'ielts-pref:';

export function getLocalPref(name) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_PREFIX}${name}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLocalPref(name, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LOCAL_PREFIX}${name}`, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

// Read one pref for a signed-in user. Missing row, network error, and RLS
// failures all resolve to null so callers can fall back to the local copy.
export async function loadUserPref(userId, name) {
  if (!userId) return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('prefs')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    const prefs = data?.prefs;
    return prefs && typeof prefs === 'object' ? (prefs[name] ?? null) : null;
  } catch {
    return null;
  }
}

// Merge one pref into a signed-in user's prefs blob. Read-then-write, last
// writer wins — fine for boolean UI flags.
export async function saveUserPref(userId, name, value) {
  if (!userId) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('users')
      .select('prefs')
      .eq('id', userId)
      .maybeSingle();
    const prefs = data?.prefs && typeof data.prefs === 'object' ? { ...data.prefs } : {};
    prefs[name] = value;
    await supabase.from('users').update({ prefs }).eq('id', userId);
  } catch {
    /* non-fatal */
  }
}
