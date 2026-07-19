import { describe, expect, it } from 'vitest';
import { OG_TYPE_LABELS, ogTypeLabel } from './ogCard';

describe('OG card type labels', () => {
  it('defines the complete renderer allowlist, including the Band Estimator', () => {
    expect(OG_TYPE_LABELS).toMatchObject({
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
    });
  });

  it('normalizes supported values and keeps an explicit safe fallback', () => {
    expect(ogTypeLabel(' Estimator ')).toBe('BAND ESTIMATOR');
    expect(ogTypeLabel('unknown-card')).toBe('IELTS PRACTICE');
    expect(ogTypeLabel(null)).toBe('IELTS PRACTICE');
  });
});
