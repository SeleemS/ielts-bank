import { resolveSpeakingAuthAction } from './pendingSpeakingSession';

// A completed live interview may outlive the first scoring request. Keep its
// transcript only in tab-scoped sessionStorage (never durable localStorage),
// bind it to the account that ran the session, and expire it after one day.
const STORAGE_KEY = 'ielts-pending-realtime-score';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TRANSCRIPT_CHARS = 60000;
const ALLOWED_MODES = new Set(['mock', 'part1', 'part2', 'part3']);

function normalizePendingRealtimeScore(value) {
  if (!value || value.version !== 1) return null;
  const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
  const mode = typeof value.mode === 'string' ? value.mode : '';
  const createdAt = Number(value.createdAt);
  if (!userId || !ALLOWED_MODES.has(mode) || !Number.isFinite(createdAt)) return null;
  if (!Array.isArray(value.transcript) || value.transcript.length === 0) return null;

  let totalChars = 0;
  const transcript = [];
  for (const turn of value.transcript) {
    if (
      !turn
      || (turn.role !== 'examiner' && turn.role !== 'candidate')
      || typeof turn.text !== 'string'
      || !turn.text.trim()
    ) {
      return null;
    }
    const text = turn.text.trim();
    totalChars += text.length;
    if (totalChars > MAX_TRANSCRIPT_CHARS) return null;
    transcript.push({ role: turn.role, text });
  }

  return { version: 1, userId, mode, createdAt, transcript };
}

export function savePendingRealtimeScore(storage, pending) {
  const normalized = normalizePendingRealtimeScore(pending);
  if (!storage || !normalized) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingRealtimeScore(storage, { now = Date.now() } = {}) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizePendingRealtimeScore(JSON.parse(raw));
    if (
      !normalized
      || normalized.createdAt > now + 60000
      || now - normalized.createdAt > MAX_AGE_MS
    ) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {}
    return null;
  }
}

export function clearPendingRealtimeScore(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {}
}

export async function submitPendingRealtimeScore({
  currentUserId,
  fetchFn,
  getClient,
  pending,
}) {
  const normalized = normalizePendingRealtimeScore(pending);
  if (!normalized) return { status: 'invalid' };
  if (!currentUserId) return { status: 'sign_in' };
  if (normalized.userId !== currentUserId) return { status: 'owner_mismatch' };

  const auth = await resolveSpeakingAuthAction(getClient);
  if (auth.state === 'retry') return { status: 'auth_error' };
  if (auth.state === 'sign_in') return { status: 'sign_in' };

  try {
    const response = await fetchFn('/api/score/speaking-realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({
        mode: normalized.mode,
        transcript: normalized.transcript,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) return { status: 'sign_in' };
    if (!response.ok) {
      return {
        status: 'api_error',
        message: body.error || 'Scoring failed. Please try again.',
      };
    }
    if (!Number.isFinite(body.overallBand)) {
      return {
        status: 'api_error',
        message: 'Scoring returned an incomplete result. Please try again.',
      };
    }
    return { status: 'success', result: body };
  } catch {
    return { status: 'network_error' };
  }
}
