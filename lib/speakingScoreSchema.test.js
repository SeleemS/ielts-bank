import { describe, expect, it } from 'vitest';
import {
  buildSpeakingScoreSchema,
  isValidSpeakingBand,
} from './speakingScoreSchema';

const BAND_CONSTRAINTS = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

describe('Recorded Speaking score validation', () => {
  it('constrains every Structured Output band to valid IELTS half bands', () => {
    const output = buildSpeakingScoreSchema();
    const properties = output.schema.properties;

    expect(output.strict).toBe(true);
    expect(properties.overallBand).toMatchObject(BAND_CONSTRAINTS);
    for (const criterion of Object.values(properties.criteria.properties)) {
      expect(criterion.properties.band).toMatchObject(BAND_CONSTRAINTS);
    }
  });

  it.each([0, 0.5, 6, 6.5, 9])('accepts valid band %s', (band) => {
    expect(isValidSpeakingBand(band)).toBe(true);
  });

  it.each([-0.5, 6.25, 9.5, Number.NaN, Infinity, '6.5'])(
    'rejects invalid band %s',
    (band) => {
      expect(isValidSpeakingBand(band)).toBe(false);
    }
  );
});
