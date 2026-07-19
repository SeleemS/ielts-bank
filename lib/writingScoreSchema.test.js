import { describe, expect, it } from 'vitest';
import { buildWritingScoreSchema } from './writingScoreSchema';

const BAND_CONSTRAINTS = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

describe('Writing Structured Output schema', () => {
  it.each([
    [1, 'taskAchievement'],
    [2, 'taskResponse'],
  ])(
    'constrains every Task %i band to valid IELTS half bands',
    (task, firstCriterion) => {
      const output = buildWritingScoreSchema(task);
      const properties = output.schema.properties;

      expect(output.strict).toBe(true);
      expect(properties.overallBand).toMatchObject(BAND_CONSTRAINTS);
      expect(Object.keys(properties.criteria.properties)).toEqual([
        firstCriterion,
        'coherenceCohesion',
        'lexicalResource',
        'grammaticalRange',
      ]);

      for (const criterion of Object.values(properties.criteria.properties)) {
        expect(criterion.properties.band).toMatchObject(BAND_CONSTRAINTS);
      }
    }
  );
});
