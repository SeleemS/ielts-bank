// src/lib/liveTranscript.js
// The gpt-live-1 data channel emits raw transcript fragments only — no item ids
// and no "done" event — so turn grouping is ours. Pure assembler: concatenate
// deltas exactly (the model already includes its own spacing) and start a new
// turn whenever the speaker changes or the same speaker resumes after a gap.
const ROLES = new Set(['candidate', 'examiner']);

export function createLiveTranscriptAssembler({ gapMs = 1500 } = {}) {
  const turns = [];

  // Trim for consumers (captions, scoring); empty turns never surface.
  const snapshot = () => turns
    .map((turn) => ({
      role: turn.role,
      text: turn.text.trim(),
      start_ms: turn.start_ms,
      end_ms: turn.end_ms,
    }))
    .filter((turn) => turn.text);

  function push(role, fragment = {}) {
    if (!ROLES.has(role)) return snapshot();
    const delta = typeof fragment.delta === 'string' ? fragment.delta : '';
    if (!delta) return snapshot();
    const startMs = Number.isFinite(fragment.start_ms) ? fragment.start_ms : null;
    const endMs = Number.isFinite(fragment.end_ms) ? fragment.end_ms : startMs;

    const last = turns[turns.length - 1];
    // Fragments can arrive slightly out of order; only a forward gap past the
    // threshold splits a turn, an earlier start just appends to the open turn.
    const gapped = last
      && startMs != null
      && Number.isFinite(last.end_ms)
      && startMs - last.end_ms > gapMs;
    if (!last || last.role !== role || gapped) {
      turns.push({
        role,
        text: delta,
        start_ms: startMs,
        end_ms: endMs,
      });
      return snapshot();
    }

    last.text += delta;
    if (startMs != null) {
      last.start_ms = Number.isFinite(last.start_ms) ? Math.min(last.start_ms, startMs) : startMs;
    }
    if (endMs != null) {
      last.end_ms = Number.isFinite(last.end_ms) ? Math.max(last.end_ms, endMs) : endMs;
    }
    return snapshot();
  }

  return { push, turns: snapshot };
}

export default createLiveTranscriptAssembler;
