import { describe, expect, it } from 'vitest';
import { createLiveTranscriptAssembler } from '../src/lib/liveTranscript';

describe('live transcript assembler', () => {
  it('concatenates deltas of one speaker into a single turn without inventing spaces', () => {
    const a = createLiveTranscriptAssembler();
    a.push('examiner', { delta: 'Good', start_ms: 0, end_ms: 400 });
    a.push('examiner', { delta: ' morning', start_ms: 400, end_ms: 900 });
    const turns = a.push('examiner', { delta: '.', start_ms: 900, end_ms: 1000 });
    expect(turns).toEqual([{ role: 'examiner', text: 'Good morning.', start_ms: 0, end_ms: 1000 }]);
  });

  it('starts a new turn when the speaker changes', () => {
    const a = createLiveTranscriptAssembler();
    a.push('examiner', { delta: 'Where do you live?', start_ms: 0, end_ms: 1200 });
    const turns = a.push('candidate', { delta: 'In Cairo.', start_ms: 1300, end_ms: 2000 });
    expect(turns.map((t) => t.role)).toEqual(['examiner', 'candidate']);
    expect(turns[1]).toEqual({ role: 'candidate', text: 'In Cairo.', start_ms: 1300, end_ms: 2000 });
  });

  it('splits the same speaker after a silence longer than the gap', () => {
    const a = createLiveTranscriptAssembler({ gapMs: 1500 });
    a.push('candidate', { delta: 'Well', start_ms: 0, end_ms: 500 });
    const near = a.push('candidate', { delta: ' actually yes', start_ms: 1500, end_ms: 2000 });
    expect(near).toHaveLength(1);
    const far = a.push('candidate', { delta: 'And another thing', start_ms: 5000, end_ms: 5500 });
    expect(far).toHaveLength(2);
    expect(far[1].text).toBe('And another thing');
  });

  it('appends out-of-order fragments to the open turn instead of splitting', () => {
    const a = createLiveTranscriptAssembler();
    a.push('candidate', { delta: 'one two', start_ms: 1000, end_ms: 2000 });
    const turns = a.push('candidate', { delta: ' three', start_ms: 900, end_ms: 1500 });
    expect(turns).toEqual([{ role: 'candidate', text: 'one two three', start_ms: 900, end_ms: 2000 }]);
  });

  it('ignores empty deltas and unknown roles, and drops whitespace-only turns', () => {
    const a = createLiveTranscriptAssembler();
    expect(a.push('candidate', { delta: '', start_ms: 0, end_ms: 1 })).toEqual([]);
    expect(a.push('system', { delta: 'hello', start_ms: 0, end_ms: 1 })).toEqual([]);
    expect(a.push('candidate', { delta: '   ', start_ms: 0, end_ms: 1 })).toEqual([]);
    expect(a.turns()).toEqual([]);
    expect(a.push('candidate', { delta: 'ok', start_ms: 2, end_ms: 3 })[0].text).toBe('ok');
  });

  it('trims the reported text while keeping the assembled interior spacing', () => {
    const a = createLiveTranscriptAssembler();
    a.push('candidate', { delta: '  I think ', start_ms: 0, end_ms: 500 });
    a.push('candidate', { delta: 'so.  ', start_ms: 500, end_ms: 900 });
    expect(a.turns()).toEqual([{ role: 'candidate', text: 'I think so.', start_ms: 0, end_ms: 900 }]);
  });

  it('tolerates fragments without timings', () => {
    const a = createLiveTranscriptAssembler();
    a.push('examiner', { delta: 'Hello' });
    const turns = a.push('examiner', { delta: ' there' });
    expect(turns).toEqual([{ role: 'examiner', text: 'Hello there', start_ms: null, end_ms: null }]);
  });
});
