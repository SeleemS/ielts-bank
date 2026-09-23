import { describe, expect, it } from 'vitest';
import {
  MOCK_TEST_PAGES_INDEXABLE,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  robotsContent,
  speakingTopicHubIndexable,
  task2MonthIndexable,
} from './indexability';
import { buildMonthlyRoundup } from './task2Roundup';

describe('indexability rules', () => {
  it('keeps mock-test shells out of the index', () => {
    expect(MOCK_TEST_PAGES_INDEXABLE).toBe(false);
  });

  it('indexes a speaking topic hub only once it has 3+ cue cards', () => {
    expect(speakingTopicHubIndexable(0)).toBe(false);
    expect(speakingTopicHubIndexable(2)).toBe(false);
    expect(speakingTopicHubIndexable(3)).toBe(true);
    expect(speakingTopicHubIndexable(10)).toBe(true);
  });

  it('noindexes a past fallback month but keeps the current month and real months', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    expect(task2MonthIndexable({ source: 'new', month: { isoMonth: '2026-07' } }, now)).toBe(true);
    expect(task2MonthIndexable({ source: 'mixed', month: { isoMonth: '2026-08' } }, now)).toBe(true);
    expect(task2MonthIndexable({ source: 'recent', month: { isoMonth: '2026-09' } }, now)).toBe(false);
    expect(task2MonthIndexable({ source: 'recent', month: { isoMonth: '2026-10' } }, now)).toBe(true);
    expect(task2MonthIndexable(null, now)).toBe(false);
  });

  it('works on a real roundup built from prompts', () => {
    const prompts = [
      { slug: 'a', title: 'A', frame: 'opinion', added: '2026-08-02', updated: '2026-08-02' },
    ];
    const september = buildMonthlyRoundup(prompts, 'september-2026', { now: new Date('2026-10-01T00:00:00Z') });
    expect(september.source).toBe('recent');
    expect(task2MonthIndexable(september, new Date('2026-10-01T00:00:00Z'))).toBe(false);
    expect(task2MonthIndexable(september, new Date('2026-09-20T00:00:00Z'))).toBe(true);
  });

  it('maps to robots meta values that keep links followed', () => {
    expect(robotsContent(true)).toBe(ROBOTS_INDEX);
    expect(robotsContent(false)).toBe(ROBOTS_NOINDEX);
    expect(ROBOTS_NOINDEX).toBe('noindex, follow');
  });
});
