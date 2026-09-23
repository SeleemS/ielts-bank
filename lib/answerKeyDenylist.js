// lib/answerKeyDenylist.js
// Passages that must NEVER get a "<title> reading answers" page or a
// "…with Answers" practice-page title.
//
// Why: the 27 legacy (pre-Supabase, Firestore-imported) Reading passages carry
// titles that match or closely echo well-known published IELTS passages (e.g.
// Cambridge IELTS "Endless Harvest", "Numeration", "Australia's Sporting
// Success", "Is There Anybody Out There?"). Our text is not those passages, so
// a searcher looking for the official book's answers would land on a key that
// does not match their paper — bad for trust, bounce rate and trademark/legal
// exposure (docs/growth-2026-09-23/10-SEO-STRATEGY.md, action #3 caution).
//
// Matching is on the NORMALISED title (case, punctuation and whitespace
// insensitive), so a rename is the way to take a passage off this list.
// Add any future title that collides with a published IELTS passage here.

export const ANSWER_KEY_TITLE_DENYLIST = [
  "Australia's Sporting Success",
  'Biological Control of Pests',
  'Early Childhood Education',
  'How much higher? How much faster?',
  'Findings of a Neuroscientist',
  'Endless Harvest',
  'Some Places to Visit',
  'The Problem of Scarce Resources',
  'Aphantasia: A life without mental images',
  'Tragedy in Uppark',
  'Land of the Rising Sun',
  'Intercity Sleeper London-Scotland',
  'William Henry Perkin',
  'Venus in Transit',
  'Nature or Nurture?',
  'West Thames College',
  'West Thames College II',
  'Auditory Challenges in the Classroom',
  'Collecting Ant Specimens',
  'Is There Anybody Out There?',
  'Air Traffic Control in the USA',
  'Numeration',
  'The Effect of Light on Plants and Animals',
  'The Effect of Light on Plant and Animal Species',
  'Coal and Pollution',
  'The Evolution of A Kiss',
  'The Return of Artificial Intelligence',
  'Advantages of Public Transport',
];

export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const DENIED = new Set(ANSWER_KEY_TITLE_DENYLIST.map(normalizeTitle));

export function isAnswerKeyTitleDenied(title) {
  return DENIED.has(normalizeTitle(title));
}
