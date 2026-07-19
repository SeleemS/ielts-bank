const BAND_NUMBER_SCHEMA = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

export function buildWritingScoreSchema(task) {
  const firstLabel = task === 1 ? 'taskAchievement' : 'taskResponse';
  const criterion = {
    type: 'object',
    additionalProperties: false,
    properties: {
      band: {
        ...BAND_NUMBER_SCHEMA,
        description: 'IELTS band from 0 to 9, in half-band increments',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description:
          '1-3 bullets, each under 20 words, naming something the candidate did well on this criterion with brief quoted evidence',
      },
      improvements: {
        type: 'array',
        items: { type: 'string' },
        description:
          '1-3 actionable bullets, each under 20 words, naming what would raise this band, citing the essay where possible',
      },
    },
    required: ['band', 'strengths', 'improvements'],
  };

  return {
    name: 'ielts_writing_assessment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        overallBand: {
          ...BAND_NUMBER_SCHEMA,
          description:
            'Average of the four criteria, rounded to the nearest half band',
        },
        criteria: {
          type: 'object',
          additionalProperties: false,
          properties: {
            [firstLabel]: criterion,
            coherenceCohesion: criterion,
            lexicalResource: criterion,
            grammaticalRange: criterion,
          },
          required: [
            firstLabel,
            'coherenceCohesion',
            'lexicalResource',
            'grammaticalRange',
          ],
        },
        summary: { type: 'string' },
        improvements: {
          type: 'array',
          items: { type: 'string' },
        },
        correctedExamples: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              original: { type: 'string' },
              suggestion: { type: 'string' },
            },
            required: ['original', 'suggestion'],
          },
        },
      },
      required: [
        'overallBand',
        'criteria',
        'summary',
        'improvements',
        'correctedExamples',
      ],
    },
  };
}
