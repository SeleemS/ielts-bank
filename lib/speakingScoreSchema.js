const BAND_NUMBER_SCHEMA = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

export function isValidSpeakingBand(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 9 &&
    Number.isInteger(value * 2)
  );
}

export function buildSpeakingScoreSchema() {
  const criterion = {
    type: 'object',
    additionalProperties: false,
    properties: {
      band: {
        ...BAND_NUMBER_SCHEMA,
        description: 'IELTS band from 0 to 9, in half-band increments',
      },
      feedback: {
        type: 'string',
        description: 'Evidence-based feedback citing the transcript',
      },
    },
    required: ['band', 'feedback'],
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
        },
      },
      required: ['overallBand', 'criteria', 'summary', 'improvements'],
    },
  };
}
