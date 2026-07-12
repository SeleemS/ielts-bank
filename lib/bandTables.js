// lib/bandTables.js
// ESTIMATED, publicly-circulated raw-score -> IELTS band conversion tables for
// Listening, Academic Reading and General Training Reading. These are the
// well-known community approximations; the official conversion is set per test
// version by the test partners and is NOT published, so treat every band here
// as an estimate only. The /band-calculator page reads these tables directly so
// the calculator has NO runtime database dependency. The same rows are seeded
// into the `band_tables` / `band_table_rows` tables by
// supabase/migrations/0012_seed_band_tables.sql for parity.
//
// Row shape: { rawMin, rawMax, band } — inclusive raw-correct-count bounds
// (0..40) mapping to a numeric band (0.0..9.0 in 0.5 steps). Rows are ordered
// high band -> low band. rawToBand() walks the rows and returns the first
// matching band, falling back to the lowest listed band for very low scores.

// ---------------------------------------------------------------------------
// Listening (same table for Academic and General Training)
// ---------------------------------------------------------------------------
export const LISTENING_TABLE = [
  { rawMin: 39, rawMax: 40, band: 9.0 },
  { rawMin: 37, rawMax: 38, band: 8.5 },
  { rawMin: 35, rawMax: 36, band: 8.0 },
  { rawMin: 32, rawMax: 34, band: 7.5 },
  { rawMin: 30, rawMax: 31, band: 7.0 },
  { rawMin: 26, rawMax: 29, band: 6.5 },
  { rawMin: 23, rawMax: 25, band: 6.0 },
  { rawMin: 18, rawMax: 22, band: 5.5 },
  { rawMin: 16, rawMax: 17, band: 5.0 },
  { rawMin: 13, rawMax: 15, band: 4.5 },
  { rawMin: 10, rawMax: 12, band: 4.0 },
  { rawMin: 8, rawMax: 9, band: 3.5 },
  { rawMin: 6, rawMax: 7, band: 3.0 },
  { rawMin: 4, rawMax: 5, band: 2.5 },
  { rawMin: 3, rawMax: 3, band: 2.0 },
  { rawMin: 2, rawMax: 2, band: 1.5 },
  { rawMin: 1, rawMax: 1, band: 1.0 },
  { rawMin: 0, rawMax: 0, band: 0.0 },
];

// ---------------------------------------------------------------------------
// Academic Reading
// ---------------------------------------------------------------------------
export const READING_ACADEMIC_TABLE = [
  { rawMin: 39, rawMax: 40, band: 9.0 },
  { rawMin: 37, rawMax: 38, band: 8.5 },
  { rawMin: 35, rawMax: 36, band: 8.0 },
  { rawMin: 33, rawMax: 34, band: 7.5 },
  { rawMin: 30, rawMax: 32, band: 7.0 },
  { rawMin: 27, rawMax: 29, band: 6.5 },
  { rawMin: 23, rawMax: 26, band: 6.0 },
  { rawMin: 19, rawMax: 22, band: 5.5 },
  { rawMin: 15, rawMax: 18, band: 5.0 },
  { rawMin: 13, rawMax: 14, band: 4.5 },
  { rawMin: 10, rawMax: 12, band: 4.0 },
  { rawMin: 8, rawMax: 9, band: 3.5 },
  { rawMin: 6, rawMax: 7, band: 3.0 },
  { rawMin: 4, rawMax: 5, band: 2.5 },
  { rawMin: 3, rawMax: 3, band: 2.0 },
  { rawMin: 2, rawMax: 2, band: 1.5 },
  { rawMin: 1, rawMax: 1, band: 1.0 },
  { rawMin: 0, rawMax: 0, band: 0.0 },
];

// ---------------------------------------------------------------------------
// General Training Reading (needs a higher raw score for the same band)
// ---------------------------------------------------------------------------
export const READING_GENERAL_TABLE = [
  { rawMin: 40, rawMax: 40, band: 9.0 },
  { rawMin: 39, rawMax: 39, band: 8.5 },
  { rawMin: 37, rawMax: 38, band: 8.0 },
  { rawMin: 36, rawMax: 36, band: 7.5 },
  { rawMin: 34, rawMax: 35, band: 7.0 },
  { rawMin: 32, rawMax: 33, band: 6.5 },
  { rawMin: 30, rawMax: 31, band: 6.0 },
  { rawMin: 27, rawMax: 29, band: 5.5 },
  { rawMin: 23, rawMax: 26, band: 5.0 },
  { rawMin: 19, rawMax: 22, band: 4.5 },
  { rawMin: 15, rawMax: 18, band: 4.0 },
  { rawMin: 12, rawMax: 14, band: 3.5 },
  { rawMin: 9, rawMax: 11, band: 3.0 },
  { rawMin: 6, rawMax: 8, band: 2.5 },
  { rawMin: 4, rawMax: 5, band: 2.0 },
  { rawMin: 2, rawMax: 3, band: 1.5 },
  { rawMin: 1, rawMax: 1, band: 1.0 },
  { rawMin: 0, rawMax: 0, band: 0.0 },
];

// Registry keyed for lookups + seeding. `skill`/`module` mirror the
// band_tables columns (module null = applies to both).
export const BAND_TABLES = {
  listening: { skill: 'listening', module: null, name: 'Listening (estimated)', rows: LISTENING_TABLE },
  reading_academic: { skill: 'reading', module: 'academic', name: 'Academic Reading (estimated)', rows: READING_ACADEMIC_TABLE },
  reading_general: { skill: 'reading', module: 'general', name: 'General Training Reading (estimated)', rows: READING_GENERAL_TABLE },
};

// Clamp a raw score into the 0..40 integer range.
export function clampRaw(raw) {
  const n = Math.round(Number(raw) || 0);
  if (n < 0) return 0;
  if (n > 40) return 40;
  return n;
}

// Convert a raw correct count to a band using the given table. Returns a
// numeric band (0..9) or null if the input is not a finite number.
export function rawToBand(table, raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = clampRaw(raw);
  for (const row of table) {
    if (n >= row.rawMin && n <= row.rawMax) return row.band;
  }
  // Below the lowest listed range: fall back to the lowest band in the table.
  return table[table.length - 1].band;
}

// Look up the estimated Listening band for a raw score.
export function listeningBand(raw) {
  return rawToBand(LISTENING_TABLE, raw);
}

// Look up the estimated Reading band for a raw score, honouring the module.
export function readingBand(raw, module = 'academic') {
  const table = module === 'general' ? READING_GENERAL_TABLE : READING_ACADEMIC_TABLE;
  return rawToBand(table, raw);
}

// Official IELTS overall-band rounding rule applied to the mean of the four
// skill bands:
//   - a .25 mean is rounded UP to the next half band
//   - a .75 mean is rounded UP to the next whole band
//   - otherwise round to the nearest half band as normal
// Implementation: round the mean to the nearest 0.5, but a mean that ends in
// exactly .25 or .75 sits on a boundary and is rounded UP (ceil to the next
// half band). Standard nearest-half rounding already sends .26..49 -> .5 and
// .76..99 -> next whole, so we only special-case the exact quarter boundaries.
export function overallBand(bands) {
  const valid = bands.filter((b) => typeof b === 'number' && !Number.isNaN(b));
  if (valid.length !== 4) return null;
  const mean = valid.reduce((sum, b) => sum + b, 0) / 4;
  // Work in tenths to avoid floating-point drift on .25 / .75 boundaries.
  const tenths = Math.round(mean * 100) / 100; // e.g. 6.25, 6.75
  const frac = tenths - Math.floor(tenths);
  const isQuarter = Math.abs(frac - 0.25) < 1e-9 || Math.abs(frac - 0.75) < 1e-9;
  if (isQuarter) {
    // Round UP to the next half band.
    return Math.ceil(tenths * 2) / 2;
  }
  // Nearest half band.
  return Math.round(tenths * 2) / 2;
}

// Format a band for display: always one decimal place (e.g. "7.0", "6.5").
export function formatBand(band) {
  if (band === null || band === undefined || Number.isNaN(band)) return '—';
  return Number(band).toFixed(1);
}
