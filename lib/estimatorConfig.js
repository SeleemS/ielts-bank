// lib/estimatorConfig.js
//
// The Band Estimator's fixed content + self-assessment CONTRACT. This module is
// the single source of truth other agents build against (the page's
// getStaticProps, EstimatorRunner, and score.js). It is config-not-DB on purpose:
// SSG-cacheable and versionable, so the fixed question sets can rotate quarterly
// (bump ESTIMATOR_VERSION) without corrupting analytics comparisons.
//
// ---------------------------------------------------------------------------
// PICKED SETS (curated 2026-07-18 via scripts/content/pick-estimator-set.mjs,
// read-only anon-key scan of published passages; the founder delegated the final
// editorial choice to this curation pass — reasoning below).
//
// READING  = "Finding the Way Across the Pacific"
//   slug: finding-the-way-across-the-pacific-ymf2z4  (Academic, medium)
//   groupIndexes [1,2,3] → 10 questions, CONTIGUOUS Q5–Q14:
//     [1] sentence_completion   (text)     6 questions  Q5–10
//     [2] multiple_choice_multi (select)   1 question   Q11
//     [3] true_false_notgiven   (boolean)  3 questions  Q12–14
//   Why: exactly 10 via whole groups, all three required input families in ONE
//   set (text-completion + select + boolean), medium difficulty, and the chosen
//   groups are contiguous so the run reads coherently. Group [0]
//   (matching_features, Q1–4) is deliberately dropped to hit exactly 10. It is
//   the reading set's job to carry the boolean family, which listening lacks.
//
// LISTENING = "The Renovation of the Old Gaumont Theatre"
//   slug: the-renovation-of-the-old-gaumont-theatre-k9sos9  (medium, has audio)
//   groupIndexes [0,1,2] → 10 questions, CONTIGUOUS Q1–Q10:
//     [0] matching_features (select) 5 questions  Q1–5
//     [1] multiple_choice   (select) 1 question   Q6
//     [2] note_completion   (text)   4 questions  Q7–10
//   Why: a Section-1/2-style monologue (a tour/talk — shorter, cleaner audio
//   than the lecture items), all three whole groups sum to exactly 10, mixes
//   select + text, medium difficulty, audio present. No boolean family exists in
//   the listening bank, but the two sets TOGETHER cover boolean (reading) +
//   select (both) + text (both), satisfying the cross-set mix criterion.
//
// EXCLUDED by criteria: any group whose question_type maps to input 'visual' in
// src/components/question/grade.js TYPE_CONFIG (diagram_label,
// plan_map_diagram_label, form_completion) — none appear in the picks above.
//
// groupIndexes are ZERO-BASED indexes into the `groups[]` array returned by
// getStructuredPassage(skill, slug) in lib/supabase.js (the STRUCTURED shape,
// NOT the flattened legacy shape). selectGroups() below resolves them and
// preserves each question's original `question.number` — grading (gradeAll in
// grade.js) is keyed on that number, so it must never be renumbered.
// ---------------------------------------------------------------------------

export const ESTIMATOR_VERSION = 'v1-2026-07';

export const READING_SET = {
  skill: 'reading',
  slug: 'finding-the-way-across-the-pacific-ymf2z4',
  title: 'Finding the Way Across the Pacific',
  groupIndexes: [1, 2, 3],
};

export const LISTENING_SET = {
  skill: 'listening',
  slug: 'the-renovation-of-the-old-gaumont-theatre-k9sos9',
  title: 'The Renovation of the Old Gaumont Theatre',
  groupIndexes: [0, 1, 2],
};

// Resolve a set's configured group indexes to the actual group objects, in
// order, from a structured passage (as returned by getStructuredPassage). The
// returned groups keep their `questions` arrays and every question's original
// `number` untouched — do NOT renumber; grading is keyed on question.number.
export function selectGroups(structuredPassage, set) {
  const groups = structuredPassage?.groups || [];
  return (set?.groupIndexes || [])
    .map((index) => groups[index])
    .filter((group) => group != null);
}

// ---------------------------------------------------------------------------
// Writing & Speaking self-assessment.
//
// Three questions per skill, three options each, each option worth 0–2 points
// (higher = more confident/able). Point total (0..6) maps to a band RANGE via
// bandRanges — a deliberate ~1.0-band-wide range that signals honest
// uncertainty rather than fake precision. Every reachable total (0..6) is
// covered by exactly one range; ranges neither gap nor overlap; each is exactly
// 1.0 band wide; bands step in 0.5 within the 4.0–8.0 window.
//
// Wording is intentionally natural and non-judgmental — the tool must not feel
// like it is grading the visitor's honesty.
// ---------------------------------------------------------------------------

// Shared point→band lookup. Total points range 0..6 (three questions × 0..2).
const SELF_ASSESSMENT_BAND_RANGES = [
  { minPoints: 0, maxPoints: 0, band: { min: 4.0, max: 5.0 } },
  { minPoints: 1, maxPoints: 1, band: { min: 4.5, max: 5.5 } },
  { minPoints: 2, maxPoints: 2, band: { min: 5.0, max: 6.0 } },
  { minPoints: 3, maxPoints: 3, band: { min: 5.5, max: 6.5 } },
  { minPoints: 4, maxPoints: 4, band: { min: 6.0, max: 7.0 } },
  { minPoints: 5, maxPoints: 5, band: { min: 6.5, max: 7.5 } },
  { minPoints: 6, maxPoints: 6, band: { min: 7.0, max: 8.0 } },
];

export const WRITING_SELF_ASSESSMENT = {
  skill: 'writing',
  questions: [
    {
      id: 'writing_stamina',
      prompt: 'When you write a 250-word essay in 40 minutes, how does it usually go?',
      options: [
        { value: 'comfortable', label: 'I finish comfortably with time to check my work', points: 2 },
        { value: 'with_effort', label: 'I get there, but only just in time', points: 1 },
        { value: 'not_yet', label: 'I usually run short on time or on words', points: 0 },
      ],
    },
    {
      id: 'writing_feedback',
      prompt: 'How often has a teacher or examiner given you feedback on your writing?',
      options: [
        { value: 'regularly', label: 'Regularly — I know my common mistakes', points: 2 },
        { value: 'occasionally', label: 'Occasionally', points: 1 },
        { value: 'rarely', label: 'Rarely or never', points: 0 },
      ],
    },
    {
      id: 'writing_complexity',
      prompt: 'How do you feel about using a mix of complex sentence structures?',
      options: [
        { value: 'confident', label: 'I use them accurately and naturally', points: 2 },
        { value: 'trying', label: 'I try them, with the occasional slip', points: 1 },
        { value: 'simple', label: 'I mostly stick to simple sentences', points: 0 },
      ],
    },
  ],
  bandRanges: SELF_ASSESSMENT_BAND_RANGES,
};

export const SPEAKING_SELF_ASSESSMENT = {
  skill: 'speaking',
  questions: [
    {
      id: 'speaking_fluency',
      prompt: 'Asked to speak for two minutes on an unfamiliar topic, what tends to happen?',
      options: [
        { value: 'comfortable', label: 'I keep going comfortably', points: 2 },
        { value: 'some_pauses', label: 'I manage, with some pauses to think', points: 1 },
        { value: 'freeze', label: 'I often freeze or lose my thread', points: 0 },
      ],
    },
    {
      id: 'speaking_translate',
      prompt: 'How often do you pause to translate from your first language as you speak?',
      options: [
        { value: 'rarely', label: 'Rarely — I mostly think in English', points: 2 },
        { value: 'sometimes', label: 'Sometimes', points: 1 },
        { value: 'often', label: 'Often', points: 0 },
      ],
    },
    {
      id: 'speaking_experience',
      prompt: 'How much have you spoken English in interviews, classes, or a speaking test?',
      options: [
        { value: 'regularly', label: 'Regularly', points: 2 },
        { value: 'a_few_times', label: 'A few times', points: 1 },
        { value: 'little', label: 'Little practice so far', points: 0 },
      ],
    },
  ],
  bandRanges: SELF_ASSESSMENT_BAND_RANGES,
};

// One honest line, reused on the results screen and the FAQ.
export const SELF_ASSESSMENT_DISCLAIMER =
  'Self-ratings tend to run about half a band optimistic, so treat this as a starting point — get your real Writing and Speaking band from AI scoring.';
