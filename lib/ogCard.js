export const OG_TYPE_LABELS = Object.freeze({
  reading: 'Reading Practice',
  writing: 'Writing Practice',
  listening: 'Listening Practice',
  speaking: 'Speaking Practice',
  mock: 'IELTS Mock Test',
  blog: 'IELTS Blog',
  pricing: 'IELTS Premium',
  examiner: 'Speaking Examiner',
  calculator: 'Band Calculator',
  estimator: 'Band Estimator',
  about: 'About IELTS-Bank',
  contact: 'Contact IELTS-Bank',
  legal: 'IELTS-Bank Legal',
  home: 'Free IELTS Practice',
  default: 'IELTS Practice',
});

export function ogTypeLabel(value) {
  const type = String(value ?? '').trim().toLowerCase();
  return (OG_TYPE_LABELS[type] || OG_TYPE_LABELS.default).toUpperCase();
}
