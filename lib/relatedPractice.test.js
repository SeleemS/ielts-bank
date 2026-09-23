import { describe, expect, it } from 'vitest';
import { pickRelatedPractice, ringNeighbours } from './relatedPractice';

const items = (ids) => ids.map((id) => ({ id, title: id.toUpperCase() }));

describe('ringNeighbours', () => {
  it('returns the items after the current one, wrapping round', () => {
    const list = items(['a', 'b', 'c', 'd', 'e']);
    expect(ringNeighbours(list, 'd', 3).map((i) => i.id)).toEqual(['e', 'a', 'b']);
  });

  it('never includes the current item and caps at list size', () => {
    const list = items(['a', 'b', 'c']);
    expect(ringNeighbours(list, 'b', 10).map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('uses a stable offset when the current item is not in the list', () => {
    const list = items(['a', 'b', 'c', 'd']);
    const first = ringNeighbours(list, 'zzz', 2).map((i) => i.id);
    expect(ringNeighbours(list, 'zzz', 2).map((i) => i.id)).toEqual(first);
    expect(first).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(ringNeighbours([], 'a', 3)).toEqual([]);
    expect(ringNeighbours(items(['a']), 'a', 0)).toEqual([]);
  });
});

describe('pickRelatedPractice', () => {
  it('fills from the preferred ring first, then the full ring, without repeats', () => {
    const all = items(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const preferred = items(['b', 'd', 'f', 'h']);
    const picked = pickRelatedPractice({ preferred, all, currentId: 'd', limit: 6 }).map((i) => i.id);
    expect(picked.slice(0, 3)).toEqual(['f', 'h', 'b']);
    expect(picked).toHaveLength(6);
    expect(new Set(picked).size).toBe(6);
    expect(picked).not.toContain('d');
  });

  it('spreads inbound links: every item is linked from at least one other page', () => {
    const all = items(Array.from({ length: 40 }, (_, i) => `p${String(i).padStart(2, '0')}`));
    const inbound = new Map(all.map((i) => [i.id, 0]));
    for (const current of all) {
      for (const linked of pickRelatedPractice({ all, currentId: current.id, limit: 6 })) {
        inbound.set(linked.id, inbound.get(linked.id) + 1);
      }
    }
    const counts = [...inbound.values()];
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    // The old alphabetical rule gave the first items ~all the links.
    expect(Math.max(...counts)).toBeLessThanOrEqual(6);
  });
});
