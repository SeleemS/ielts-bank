import { describe, expect, it } from 'vitest';
import { buildSpeakingRealtimeScoreSchema } from './speakingRealtimeScoreSchema';

const BAND_CONSTRAINTS = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

describe('Realtime Speaking Structured Output schema', () => {
  it('constrains every transcript-assessed band to valid IELTS half bands', () => {
    const output = buildSpeakingRealtimeScoreSchema();
    const properties = output.schema.properties;

    expect(output.strict).toBe(true);
    expect(properties.overallBand).toMatchObject(BAND_CONSTRAINTS);
    expect(Object.keys(properties.criteria.properties)).toEqual([
      'fluencyCoherence',
      'lexicalResource',
      'grammaticalRange',
    ]);

    for (const criterion of Object.values(properties.criteria.properties)) {
      expect(criterion.properties.band).toMatchObject(BAND_CONSTRAINTS);
    }
  });

  it('requires the promised amount of criterion and priority feedback', () => {
    const properties = buildSpeakingRealtimeScoreSchema().schema.properties;

    for (const criterion of Object.values(properties.criteria.properties)) {
      expect(criterion.properties.strengths).toMatchObject({
        type: 'array',
        minItems: 1,
        maxItems: 3,
      });
      expect(criterion.properties.improvements).toMatchObject({
        type: 'array',
        minItems: 1,
        maxItems: 3,
      });
    }

    expect(properties.improvements).toMatchObject({
      type: 'array',
      minItems: 3,
      maxItems: 5,
    });
  });
});
