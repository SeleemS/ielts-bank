import { describe, expect, it } from 'vitest';
import { sanitizeGaSessionId, attributableGaSessionId } from './gaSession';

describe('GA session identity', () => {
  it('accepts a positive integer and rejects application UUIDs and unsafe inputs', () => {
    expect(sanitizeGaSessionId(1790207000)).toBe('1790207000');
    for (const value of [null, {}, '0001', '1.5', -1, '9007199254740992', '00000000-0000-4000-8000-000000000001']) {
      expect(sanitizeGaSessionId(value)).toBeNull();
    }
  });
  it('only attaches sessions inside the attribution window without inventing timestamps', () => {
    const now = 1790207000000;
    expect(attributableGaSessionId('1790207000', now)).toBe('1790207000');
    expect(attributableGaSessionId(String(now / 1000 - 86400), now)).not.toBeNull();
    expect(attributableGaSessionId(String(now / 1000 - 86401), now)).toBeNull();
    expect(attributableGaSessionId(String(now / 1000 + 1), now)).toBeNull();
  });
});
