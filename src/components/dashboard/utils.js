// src/components/dashboard/utils.js
// Pure data-shaping helpers for the progress dashboard. No network / React here
// so the transforms stay easy to reason about and reuse across dashboard parts.

import { BookOpen, Headphones, PenLine } from 'lucide-react';

// Skill -> display + routing metadata. Reading/Listening come from `attempts`,
// Writing from `scores`. (Speaking is intentionally omitted for now.)
export const SKILL_META = {
  reading: { key: 'reading', label: 'Reading', href: '/readingquestion', icon: BookOpen },
  listening: { key: 'listening', label: 'Listening', href: '/listeningquestion', icon: Headphones },
  writing: { key: 'writing', label: 'Writing', href: '/writingquestion', icon: PenLine },
};

export const SKILL_ORDER = ['reading', 'listening', 'writing'];

// Coerce a Postgres numeric (which may arrive as a string) into a finite
// number, or null when absent/unparseable.
function toBand(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Build the href for a passage/prompt row from an embedded passages record.
// Routing is /<skill>question/<slug> (see DataTable). Falls back to null so the
// row renders as plain text when the passage was deleted (set null on delete).
export function passageHref(passage) {
  if (!passage || !passage.slug || !passage.skill) return null;
  return `/${passage.skill}question/${passage.slug}`;
}

// Format an ISO timestamp as e.g. "9 Jul 2026". Guards against bad input.
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// One band number -> a one-decimal display string ("6.5", "7.0").
export function formatBand(band) {
  const n = toBand(band);
  return n === null ? '—' : n.toFixed(1);
}

// Normalize a reading/listening `attempts` row into a common activity item.
function attemptToItem(row) {
  const passage = Array.isArray(row.passages) ? row.passages[0] : row.passages;
  const band = toBand(row.band);
  const raw = row.raw_score === null || row.raw_score === undefined ? null : Number(row.raw_score);
  return {
    id: `attempt-${row.id}`,
    skill: row.skill,
    band,
    date: row.submitted_at || row.created_at,
    title: passage?.title || 'Practice passage',
    href: passageHref(passage),
    // Reading/Listening are auto-scored: surface the correct-answer count.
    detail: raw === null ? null : `${raw} correct`,
  };
}

// Normalize a writing `scores` row (with nested attempt -> passage) into the
// same activity item shape.
function scoreToItem(row) {
  const attempt = Array.isArray(row.attempts) ? row.attempts[0] : row.attempts;
  const passage = attempt
    ? Array.isArray(attempt.passages)
      ? attempt.passages[0]
      : attempt.passages
    : null;
  return {
    id: `score-${row.id}`,
    skill: 'writing',
    band: toBand(row.overall_band),
    date: row.created_at,
    title: passage?.title || 'Writing task',
    href: passageHref(passage),
    detail: 'AI-scored',
  };
}

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Merge raw attempts + scores into everything the dashboard renders:
//   { items, totalPractised, hasData, skills: { <skill>: {count, avg, best, series} } }
// `series` is a chronological (oldest->newest) array of band numbers for the
// trend sparkline. Rows without a resolved band are excluded from stats/series
// but still appear in the activity feed.
export function buildDashboardData(attempts = [], scores = []) {
  const items = [
    ...attempts.map(attemptToItem),
    ...scores.map(scoreToItem),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const skills = {};
  for (const key of SKILL_ORDER) {
    const forSkill = items.filter((it) => it.skill === key);
    // Oldest -> newest for the trend line.
    const chrono = forSkill
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const bands = chrono.map((it) => it.band).filter((b) => b !== null);
    skills[key] = {
      count: forSkill.length,
      avg: avg(bands),
      best: bands.length ? Math.max(...bands) : null,
      series: bands,
    };
  }

  return {
    items,
    totalPractised: items.length,
    hasData: items.length > 0,
    skills,
  };
}
