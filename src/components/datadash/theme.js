// Design tokens for the /data dashboard. The page deliberately commits to a
// single dark "ops room" look; values follow the validated dark-mode dataviz
// palette (sequential blue ramp, 4 categorical slots, status green for live).

export const T = {
  plane: '#0d0d0d',
  surface: '#1a1a19',
  surfaceRaised: '#232322',
  border: 'rgba(255,255,255,0.10)',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  blue: '#3987e5',
  blueSoft: 'rgba(57,135,229,0.10)',
  live: '#0ca30c',
  down: '#e66767',
};

// Sequential ramp for dark surfaces: near-zero recedes into the surface,
// maximum is brightest. (Blue steps 650→100 from the reference palette.)
export const SEQ = ['#104281', '#1c5cab', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];

// Categorical slots (dark) — validated adjacent-pairs. Fixed assignment:
// reading=blue, listening=orange, writing=aqua, speaking=yellow, everywhere.
export const SKILL_COLOR = {
  reading: '#3987e5',
  listening: '#d95926',
  writing: '#199e70',
  speaking: '#c98500',
};

export function seqColor(value, max) {
  if (!value || max <= 0) return T.surfaceRaised;
  // sqrt scale keeps single-digit countries visible next to the leaders.
  const t = Math.sqrt(value / max);
  return SEQ[Math.min(SEQ.length - 1, Math.floor(t * SEQ.length))];
}

export function fmtNum(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function fmtDurShort(secs) {
  const s = Number(secs) || 0;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(s >= 36000 ? 0 : 1)}h`;
}

export function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return 'now';
  if (secs < 60) return `${Math.round(secs)}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

const REGION_NAMES =
  typeof Intl !== 'undefined' && Intl.DisplayNames
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function countryName(code) {
  if (!code) return 'Unknown';
  try {
    return REGION_NAMES?.of(code) || code;
  } catch {
    return code;
  }
}

export function flagEmoji(code) {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return '🌐';
  const base = 0x1f1e6;
  const chars = code.toUpperCase();
  return (
    String.fromCodePoint(base + chars.charCodeAt(0) - 65) +
    String.fromCodePoint(base + chars.charCodeAt(1) - 65)
  );
}

export function pct(part, whole) {
  if (!whole) return '0%';
  const p = (100 * part) / whole;
  return `${p >= 10 ? Math.round(p) : p.toFixed(1)}%`;
}
