import { describe, expect, it } from 'vitest';
import {
  sectionBand,
  selfAssessBand,
  overallEstimate,
  formatBand,
} from './score';

// A measured section of `n` short-answer questions, each accepting 'x'. Keyed
// by the continuous global question number, exactly like the grading engine.
const makeGroups = (n) => [
  {
    questionType: 'short_answer',
    questions: Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      answerKey: { accepted: ['x'], normalize: 'lower_trim' },
    })),
  },
];

// All-correct / partial answer maps for an n-question section.
const answersFor = (correctCount) => {
  const map = {};
  for (let i = 1; i <= correctCount; i += 1) map[i] = 'x';
  return map;
};

// A 3-question self-assessment config with 0/1/2-point options per question.
const assessmentConfig = {
  skill: 'writing',
  questions: [1, 2, 3].map((n) => ({
    id: `w${n}`,
    prompt: `Q${n}`,
    options: [
      { value: 'low', label: 'Low', points: 0 },
      { value: 'mid', label: 'Mid', points: 1 },
      { value: 'high', label: 'High', points: 2 },
    ],
  })),
  bandRanges: [
    { minPoints: 0, maxPoints: 2, band: { min: 4.5, max: 5.5 } },
    { minPoints: 3, maxPoints: 4, band: { min: 5.0, max: 6.0 } },
    { minPoints: 5, maxPoints: 6, band: { min: 6.0, max: 7.0 } },
  ],
};

describe('sectionBand (measured)', () => {
  it('returns null when there are no groups', () => {
    expect(sectionBand([], {}, 'reading')).toBeNull();
    expect(sectionBand(undefined, {}, 'reading')).toBeNull();
  });

  it('maps an all-correct 10-question set to the top band', () => {
    // 10/10 -> scaled raw 40/40 -> Academic Reading band 9.0.
    expect(sectionBand(makeGroups(10), answersFor(10), 'reading')).toEqual({
      raw: 10,
      total: 10,
      band: 9.0,
    });
  });

  it('maps an all-wrong set to the bottom band', () => {
    // 0/10 -> scaled raw 0 -> band 0.0.
    expect(sectionBand(makeGroups(10), {}, 'reading')).toEqual({
      raw: 0,
      total: 10,
      band: 0.0,
    });
  });

  it('scales a partial 10-question reading score via the /40 curve', () => {
    // 7/10 -> scaled raw round(0.7*40)=28 -> Academic Reading 27-29 -> 6.5.
    expect(sectionBand(makeGroups(10), answersFor(7), 'reading')).toEqual({
      raw: 7,
      total: 10,
      band: 6.5,
    });
    // 5/10 -> scaled raw 20 -> Academic Reading 19-22 -> 5.5.
    expect(sectionBand(makeGroups(10), answersFor(5), 'reading').band).toBe(5.5);
  });

  it('uses the listening curve for listening sections', () => {
    // 7/10 -> scaled raw 28 -> Listening 26-29 -> 6.5.
    expect(sectionBand(makeGroups(10), answersFor(7), 'listening').band).toBe(6.5);
    // 5/10 -> scaled raw 20 -> Listening 18-22 -> 5.5.
    expect(sectionBand(makeGroups(10), answersFor(5), 'listening').band).toBe(5.5);
  });
});

describe('selfAssessBand (self-assessed)', () => {
  it('returns null unless every question is answered', () => {
    expect(selfAssessBand({ w1: 'high', w2: 'high' }, assessmentConfig)).toBeNull();
    expect(selfAssessBand({}, assessmentConfig)).toBeNull();
    expect(selfAssessBand(null, assessmentConfig)).toBeNull();
  });

  it('returns null for an unrecognised selected value', () => {
    expect(
      selfAssessBand({ w1: 'high', w2: 'high', w3: 'nope' }, assessmentConfig)
    ).toBeNull();
  });

  it('sums points and maps to the top range', () => {
    // 2+2+2 = 6 -> range 5..6 -> { min:6.0, max:7.0 }.
    expect(
      selfAssessBand({ w1: 'high', w2: 'high', w3: 'high' }, assessmentConfig)
    ).toEqual({ points: 6, band: { min: 6.0, max: 7.0 } });
  });

  it('maps to the bottom range for the lowest total', () => {
    // 0+0+0 = 0 -> range 0..2 -> { min:4.5, max:5.5 }.
    expect(
      selfAssessBand({ w1: 'low', w2: 'low', w3: 'low' }, assessmentConfig)
    ).toEqual({ points: 0, band: { min: 4.5, max: 5.5 } });
  });

  it('treats minPoints and maxPoints as inclusive boundaries', () => {
    // points 2 sits on the first range's maxPoints (inclusive).
    expect(
      selfAssessBand({ w1: 'high', w2: 'low', w3: 'low' }, assessmentConfig).band
    ).toEqual({ min: 4.5, max: 5.5 });
    // points 3 sits on the second range's minPoints (inclusive).
    expect(
      selfAssessBand({ w1: 'mid', w2: 'mid', w3: 'mid' }, assessmentConfig).band
    ).toEqual({ min: 5.0, max: 6.0 });
    // points 5 sits on the third range's minPoints (inclusive).
    expect(
      selfAssessBand({ w1: 'high', w2: 'high', w3: 'mid' }, assessmentConfig).band
    ).toEqual({ min: 6.0, max: 7.0 });
  });

  it('returns null for an empty-question config', () => {
    expect(selfAssessBand({}, { questions: [], bandRanges: [] })).toBeNull();
    expect(selfAssessBand({ w1: 'low' }, null)).toBeNull();
  });
});

describe('overallEstimate', () => {
  it('rounds a .25 mean up to the next half band (6.25 -> 6.5)', () => {
    // reading 6, listening 6, writing mid 7, speaking mid 6 -> mean 6.25.
    const res = overallEstimate({
      reading: 6,
      listening: 6,
      writing: { min: 6.5, max: 7.5 },
      speaking: { min: 5.5, max: 6.5 },
    });
    expect(res.overall).toBe(6.5);
    expect(res.usedSkills).toEqual(['reading', 'listening', 'writing', 'speaking']);
    expect(res.allSkills).toBe(true);
  });

  it('rounds a .75 mean up to the next whole band (6.75 -> 7.0)', () => {
    // 7 + 7 + 7 + 6 -> mean 6.75.
    const res = overallEstimate({
      reading: 7,
      listening: 7,
      writing: { min: 6.5, max: 7.5 },
      speaking: { min: 5.5, max: 6.5 },
    });
    expect(res.overall).toBe(7.0);
  });

  it('leaves a plain .5 mean unchanged', () => {
    // 6 + 7 + 6 + 7 -> mean 6.5.
    const res = overallEstimate({
      reading: 6,
      listening: 7,
      writing: { min: 5.5, max: 6.5 },
      speaking: { min: 6.5, max: 7.5 },
    });
    expect(res.overall).toBe(6.5);
  });

  it('averages only the present skills when a section is skipped', () => {
    const res = overallEstimate({
      reading: 6,
      listening: 6,
      writing: { min: 5.5, max: 6.5 },
      speaking: null,
    });
    expect(res.overall).toBe(6.0);
    expect(res.usedSkills).toEqual(['reading', 'listening', 'writing']);
    expect(res.allSkills).toBe(false);
  });

  it('returns a null overall when fewer than two skills are present', () => {
    const res = overallEstimate({
      reading: 6,
      listening: null,
      writing: null,
      speaking: null,
    });
    expect(res.overall).toBeNull();
    expect(res.usedSkills).toEqual(['reading']);
    expect(res.allSkills).toBe(false);
  });

  it('handles an empty input', () => {
    expect(overallEstimate({})).toEqual({
      overall: null,
      usedSkills: [],
      allSkills: false,
    });
    expect(overallEstimate()).toEqual({
      overall: null,
      usedSkills: [],
      allSkills: false,
    });
  });
});

describe('formatBand', () => {
  it('formats to one decimal, snapped to the nearest half band', () => {
    expect(formatBand(6.5)).toBe('6.5');
    expect(formatBand(7)).toBe('7.0');
    expect(formatBand(6.0)).toBe('6.0');
  });

  it('never shows more precision than .5', () => {
    expect(formatBand(6.25)).toBe('6.5');
    expect(formatBand(6.24)).toBe('6.0');
  });

  it('renders a dash for a null / non-numeric band', () => {
    expect(formatBand(null)).toBe('—');
    expect(formatBand(undefined)).toBe('—');
    expect(formatBand(NaN)).toBe('—');
  });
});
