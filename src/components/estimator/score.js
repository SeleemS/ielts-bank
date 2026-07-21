// src/components/estimator/score.js
// Pure scoring helpers for the Band Estimator mini-diagnostic. No React, no
// side effects, no config import — the estimator config is passed in by the
// caller so these functions stay config-agnostic and unit-testable.
//
// Reading/Listening are MEASURED from real bank questions via the existing
// grading engine. Writing is measured by default with a self-assessed fallback;
// Speaking is self-assessed into a band range. The overall estimate averages
// whatever skills are present and applies the official IELTS rounding rule
// (reused from lib/bandTables).

import { gradeAll, estimateBand } from '../question/grade';
import { roundBandMean } from '../../../lib/bandTables';

// ---------------------------------------------------------------------------
// Measured section (Reading / Listening): grade the answered groups and scale
// the raw score onto the /40 band curve for the skill. `answers` is the same
// map the grading engine uses — keyed by each question's global `number`.
// Returns { raw, total, band } or null when there are no groups.
// ---------------------------------------------------------------------------
export function sectionBand(groups, answers, skill = 'reading') {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  const { score, total } = gradeAll(groups, answers || {});
  // Academic module per the estimator's locked decision (GT noted separately).
  const band = estimateBand(score, total, skill, 'academic');
  return { raw: score, total, band };
}

// ---------------------------------------------------------------------------
// Self-assessed section (Writing / Speaking): sum the points of the selected
// option per question, then map the total to a band range. Returns
// { points, band: { min, max } } — or null unless EVERY question is answered
// with a recognised option and the total falls inside a configured range.
// `answersById` is keyed by question id; `assessmentConfig` follows the
// estimatorConfig contract: { skill, questions: [{ id, options: [{ value,
// label, points }] }], bandRanges: [{ minPoints, maxPoints, band }] }.
// ---------------------------------------------------------------------------
export function selfAssessBand(answersById, assessmentConfig) {
  if (!assessmentConfig || !Array.isArray(assessmentConfig.questions)) return null;
  const { questions, bandRanges } = assessmentConfig;
  if (questions.length === 0) return null;

  let points = 0;
  for (const q of questions) {
    const selected = answersById ? answersById[q.id] : undefined;
    if (selected === undefined || selected === null || selected === '') return null;
    const opt = (q.options || []).find((o) => o.value === selected);
    if (!opt) return null; // selected value doesn't match a known option
    points += Number(opt.points) || 0;
  }

  // Inclusive on both minPoints and maxPoints.
  const range = (bandRanges || []).find(
    (r) => points >= r.minPoints && points <= r.maxPoints
  );
  if (!range || !range.band) return null;
  return { points, band: { min: range.band.min, max: range.band.max } };
}

// ---------------------------------------------------------------------------
// Overall estimate across the four skills. reading/listening are numbers|null
// (measured bands); writing/speaking are { min, max }|null (self-assessed
// ranges). Ranges collapse to their midpoint, then the mean over non-null
// skills is rounded with the official rule. `overall` is null when fewer than
// two skills are present. `usedSkills` lists the contributing skills;
// `allSkills` is true only when all four are present.
// ---------------------------------------------------------------------------
export function overallEstimate({ reading, listening, writing, speaking } = {}) {
  const entries = [
    ['reading', toNumber(reading)],
    ['listening', toNumber(listening)],
    // Writing is a MEASURED point band once the short sample is revealed, or a
    // self-assessed range when the visitor skipped the sample. Speaking is
    // always a range today. toPoint() accepts either shape.
    ['writing', toPoint(writing)],
    ['speaking', toPoint(speaking)],
  ];
  const used = entries.filter(([, value]) => value !== null);
  const usedSkills = used.map(([name]) => name);
  const allSkills = usedSkills.length === 4;

  if (used.length < 2) {
    return { overall: null, usedSkills, allSkills };
  }
  const mean = used.reduce((sum, [, value]) => sum + value, 0) / used.length;
  return { overall: roundBandMean(mean), usedSkills, allSkills };
}

// ---------------------------------------------------------------------------
// Display a band with no more precision than half a band: '6.5', '7.0'.
// ---------------------------------------------------------------------------
export function formatBand(band) {
  if (typeof band !== 'number' || Number.isNaN(band)) return '—';
  const snapped = Math.round(band * 2) / 2;
  return snapped.toFixed(1);
}

// --- internal helpers ------------------------------------------------------
function toNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

// A skill contributes either a measured point band (number) or the midpoint of a
// self-assessed { min, max } range.
function toPoint(value) {
  const asNumber = toNumber(value);
  if (asNumber !== null) return asNumber;
  return midpoint(value);
}

function midpoint(range) {
  if (
    !range ||
    typeof range.min !== 'number' ||
    typeof range.max !== 'number' ||
    Number.isNaN(range.min) ||
    Number.isNaN(range.max)
  ) {
    return null;
  }
  return (range.min + range.max) / 2;
}
