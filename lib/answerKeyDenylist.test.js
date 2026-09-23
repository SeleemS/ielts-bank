// Guards the editorial exclusion for passage titles that collide with
// published (Cambridge) IELTS passages: they must never get a
// "<title> reading answers" page or a "…with Answers" practice title.
import { describe, expect, it } from 'vitest';
import { ANSWER_KEY_TITLE_DENYLIST, isAnswerKeyTitleDenied, normalizeTitle } from './answerKeyDenylist';

describe('answer-key title denylist', () => {
  it('denies the known Cambridge-colliding titles named in the SEO strategy', () => {
    for (const title of [
      'Endless Harvest',
      'Numeration',
      "Australia's Sporting Success",
      'Is There Anybody Out There?',
    ]) {
      expect(isAnswerKeyTitleDenied(title), title).toBe(true);
    }
  });

  it('covers every legacy-imported reading passage title', () => {
    // The 27 Firestore-era passages (legacy_firestore_id set) as of Sep 2026.
    expect(ANSWER_KEY_TITLE_DENYLIST.length).toBeGreaterThanOrEqual(27);
    expect(isAnswerKeyTitleDenied('William Henry Perkin')).toBe(true);
    expect(isAnswerKeyTitleDenied('The Return of Artificial Intelligence')).toBe(true);
  });

  it('matches case-, punctuation-, apostrophe- and whitespace-insensitively', () => {
    expect(isAnswerKeyTitleDenied('  endless   harvest ')).toBe(true);
    expect(isAnswerKeyTitleDenied('Australia’s sporting success')).toBe(true);
    expect(isAnswerKeyTitleDenied('IS THERE ANYBODY OUT THERE')).toBe(true);
    expect(
      isAnswerKeyTitleDenied('Aphantasia: A life without mental images                                                 ')
    ).toBe(true);
    expect(normalizeTitle("Nature or Nurture?")).toBe('nature or nurture');
  });

  it('does not deny our original-titled passages', () => {
    for (const title of ['Why the Body Needs Vitamins', 'How to Read Food Labels', 'Booking an Airport Taxi', '']) {
      expect(isAnswerKeyTitleDenied(title), title).toBe(false);
    }
  });

  it('only denies exact titles, not titles that merely contain a denied word', () => {
    expect(isAnswerKeyTitleDenied('The Numeration of Ancient Egypt')).toBe(false);
  });
});
