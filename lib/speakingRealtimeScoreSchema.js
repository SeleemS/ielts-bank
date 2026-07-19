const BAND_NUMBER_SCHEMA = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

export function buildSpeakingRealtimeScoreSchema() {
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
        minItems: 1,
        maxItems: 3,
        description:
          '1-3 bullets, each under 20 words, naming something the candidate did well with brief quoted evidence',
      },
      improvements: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
        description:
          '1-3 actionable bullets, each under 20 words, naming what would raise this band',
      },
    },
    required: ['band', 'strengths', 'improvements'],
  };

  return {
    name: 'ielts_speaking_assessment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        overallBand: {
          ...BAND_NUMBER_SCHEMA,
          description:
            'Average of the three criteria, rounded to the nearest half band',
        },
        criteria: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fluencyCoherence: criterion,
            lexicalResource: criterion,
            grammaticalRange: criterion,
          },
          required: [
            'fluencyCoherence',
            'lexicalResource',
            'grammaticalRange',
          ],
        },
        summary: { type: 'string' },
        improvements: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 5,
        },
      },
      required: ['overallBand', 'criteria', 'summary', 'improvements'],
    },
  };
}
