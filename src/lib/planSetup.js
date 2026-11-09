// Optional "set up your plan" answers collected on the dashboard after
// sign-up (the sign-up dialog itself stays email-first). Everything lives in
// users.prefs except the two columns the lifecycle emails already read
// (exam_date, target_band).

export const PLAN_GOALS = [
  { key: 'study', label: 'Study abroad' },
  { key: 'work', label: 'Work / visa' },
  { key: 'immigration', label: 'Immigration' },
  { key: 'general', label: 'General English' },
];

export const PLAN_TEST_TYPES = [
  { key: 'academic', label: 'Academic' },
  { key: 'general', label: 'General Training' },
  { key: 'unsure', label: 'Not sure yet' },
];

export const PLAN_BANDS = ['6.0', '6.5', '7.0', '7.5', '8.0+'];

export const PLAN_DESTINATIONS = [
  { key: 'uk', label: 'United Kingdom' },
  { key: 'ca', label: 'Canada' },
  { key: 'au', label: 'Australia' },
  { key: 'us', label: 'United States' },
  { key: 'nz', label: 'New Zealand' },
  { key: 'ie', label: 'Ireland' },
  { key: 'de', label: 'Germany' },
  { key: 'eu_other', label: 'Elsewhere in Europe' },
  { key: 'asia', label: 'Asia' },
  { key: 'other', label: 'Somewhere else' },
  { key: 'undecided', label: 'Not decided yet' },
];

export const PLAN_ROLES = [
  { key: 'learner', label: 'I am taking the test' },
  { key: 'teacher', label: 'I teach IELTS' },
];

const keysOf = (list) => new Set(list.map((item) => item.key));
const GOAL_KEYS = keysOf(PLAN_GOALS);
const TEST_KEYS = keysOf(PLAN_TEST_TYPES);
const DEST_KEYS = keysOf(PLAN_DESTINATIONS);
const ROLE_KEYS = keysOf(PLAN_ROLES);

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// True once the learner has either answered or dismissed the card.
export function planSetupDone(profile) {
  const prefs = profile?.prefs && typeof profile.prefs === 'object' ? profile.prefs : {};
  return Boolean(prefs.planSetupAt || prefs.planSetupDismissedAt || prefs.goal);
}

export function hasAnyAnswer(answers = {}) {
  return Boolean(
    answers.goal || answers.testType || answers.band || answers.examDate || answers.destination || answers.role
  );
}

// Build the users-row patch for a set of answers. Unknown keys are dropped
// and a past exam date is ignored, so a tampered form cannot write junk.
export function buildPlanSetupPatch(profile, answers = {}, now = new Date()) {
  const prefs = { ...(profile?.prefs && typeof profile.prefs === 'object' ? profile.prefs : {}) };
  const patch = {};
  if (GOAL_KEYS.has(answers.goal)) prefs.goal = answers.goal;
  if (TEST_KEYS.has(answers.testType)) prefs.testType = answers.testType;
  if (DEST_KEYS.has(answers.destination)) prefs.destination = answers.destination;
  if (ROLE_KEYS.has(answers.role)) prefs.role = answers.role;
  if (PLAN_BANDS.includes(answers.band)) patch.target_band = parseFloat(answers.band); // '8.0+' -> 8
  if (/^\d{4}-\d{2}-\d{2}$/.test(answers.examDate || '') && answers.examDate >= todayIso(now)) {
    patch.exam_date = answers.examDate;
    prefs.examDate = answers.examDate;
  }
  prefs.planSetupAt = now.toISOString();
  patch.prefs = prefs;
  return patch;
}

export function buildPlanDismissPatch(profile, now = new Date()) {
  const prefs = { ...(profile?.prefs && typeof profile.prefs === 'object' ? profile.prefs : {}) };
  prefs.planSetupDismissedAt = now.toISOString();
  return { prefs };
}
