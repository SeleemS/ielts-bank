// Design tokens for the /data dashboard — DataFast clone spec (Jul 2026).
// Near-black canvas, warm off-white ink, coral-orange revenue accent, cool
// blue reserved for visitors + map, green/red only as trend deltas + live.

export const T = {
  canvas: '#0B0E13',
  panel: '#12161D',
  panelHover: '#161B23',
  border: '#232A34',
  divider: '#1D2530',
  chrome: '#1B212B',
  ink: '#E7E3DC',
  muted: '#8B93A1',
  faint: '#5B6472',
  accent: '#E8794F',
  barVisitors: '#2F5068',
  barRevenue: '#6E3A34',
  line: '#5AA9E6',
  mapHigh: '#7FC4FF',
  mapBase: '#1C2733',
  up: '#4EA67A',
  down: '#C96A6A',
  live: '#3ECF8E',
  space: '#05070B',
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}

const MAP_LO = hexToRgb(T.mapBase);
const MAP_HI = hexToRgb(T.mapHigh);

// Choropleth intensity: mapBase → mapHigh, sqrt scale so small countries
// stay visible next to the leader.
export function mapColor(value, max) {
  if (!value || max <= 0) return T.mapBase;
  const t = Math.sqrt(Math.min(1, value / max));
  const mix = MAP_LO.map((lo, index) => Math.round(lo + (MAP_HI[index] - lo) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

export function fmtNum(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtMoney(minor) {
  const dollars = (Number(minor) || 0) / 100;
  if (dollars >= 10000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 100 || Number.isInteger(dollars)) return `$${Math.round(dollars).toLocaleString()}`;
  return `$${dollars.toFixed(2)}`;
}

// "2m 49s" style, per the spec's Session time KPI.
export function fmtDur(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

export function fmtDurShort(secs) {
  const s = Number(secs) || 0;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(s >= 36000 ? 0 : 1)}h`;
}

export function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return 'just now';
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

export function pct(part, whole, digits) {
  if (!whole) return '0%';
  const p = (100 * part) / whole;
  const d = digits ?? (p >= 10 ? 0 : p >= 1 ? 1 : 2);
  return `${p.toFixed(d)}%`;
}
