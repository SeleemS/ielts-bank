import * as React from 'react';
import { T, fmtNum } from './theme';
import { useTip, TipBox, TipRow } from './primitives';

const ROWS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'events', label: 'Events' },
  { key: 'submits', label: 'Practice submits' },
];

const PAD = { left: 42, right: 12 };
const ROW_H = 72;
const GAP = 16;
const AXIS_H = 22;

function niceMax(value) {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const mult of [1, 2, 2.5, 5, 10]) if (mult * pow >= value) return mult * pow;
  return 10 * pow;
}

// Visitors / events / submits live on different scales → three aligned
// single-series panels sharing one x-axis and one crosshair (no dual axis).
export default function TrafficChart({ series, bucket }) {
  const { tip, show, hide } = useTip();
  const wrapRef = React.useRef(null);
  const [width, setWidth] = React.useState(640);
  const [cursor, setCursor] = React.useState(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = series || [];
  const height = ROWS.length * (ROW_H + GAP) + AXIS_H;
  const plotW = Math.max(50, width - PAD.left - PAD.right);
  const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const xAt = (index) => PAD.left + index * stepX;

  const fmtTick = (iso) => {
    const d = new Date(iso);
    return bucket === 'hour'
      ? `${String(d.getUTCHours()).padStart(2, '0')}:00`
      : d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  const onMove = (evt) => {
    if (!points.length) return;
    const bounds = wrapRef.current.getBoundingClientRect();
    const x = evt.clientX - bounds.left;
    const index = Math.max(0, Math.min(points.length - 1, Math.round((x - PAD.left) / stepX)));
    setCursor(index);
    const pt = points[index];
    show(
      Math.min(x, width - 160),
      evt.clientY - bounds.top,
      <div>
        <div className="mb-1 font-semibold" style={{ color: T.ink }}>
          {fmtTick(pt.t)}
          {bucket === 'hour' ? ' UTC' : ''}
        </div>
        {ROWS.map((row) => (
          <TipRow key={row.key} swatch={T.line} label={row.label} value={fmtNum(pt[row.key])} />
        ))}
        <TipRow label="Sign-ups" value={fmtNum(pt.signups)} />
      </div>
    );
  };
  const onLeave = () => {
    setCursor(null);
    hide();
  };

  const tickEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
      <svg width="100%" height={height} role="img" aria-label="Traffic over time">
        <defs>
          <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.line} stopOpacity="0.18" />
            <stop offset="100%" stopColor={T.line} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ROWS.map((row, rowIndex) => {
          const top = rowIndex * (ROW_H + GAP);
          const max = niceMax(Math.max(1, ...points.map((pt) => pt[row.key] || 0)));
          const yAt = (value) => top + ROW_H - (ROW_H - 16) * ((value || 0) / max) - 2;
          const line = points.map((pt, i) => `${i ? 'L' : 'M'}${xAt(i)},${yAt(pt[row.key])}`).join('');
          const area = points.length
            ? `${line}L${xAt(points.length - 1)},${top + ROW_H}L${xAt(0)},${top + ROW_H}Z`
            : '';
          return (
            <g key={row.key}>
              <text x={PAD.left} y={top + 10} fontSize="10" fontWeight="700" letterSpacing="1" fill={T.faint}>
                {row.label.toUpperCase()}
              </text>
              <text x={width - PAD.right} y={top + 10} fontSize="10" textAnchor="end" fill={T.faint}>
                {fmtNum(max)}
              </text>
              <line x1={PAD.left} y1={top + ROW_H} x2={width - PAD.right} y2={top + ROW_H} stroke={T.divider} />
              <line x1={PAD.left} y1={top + 16} x2={width - PAD.right} y2={top + 16} stroke={T.divider} opacity="0.5" />
              {area && <path d={area} fill="url(#trafficFill)" />}
              {line && (
                <path d={line} fill="none" stroke={T.line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {cursor != null && points[cursor] && (
                <circle
                  cx={xAt(cursor)}
                  cy={yAt(points[cursor][row.key])}
                  r="4"
                  fill={T.line}
                  stroke={T.panel}
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
        {points.map((pt, i) =>
          i % tickEvery === 0 ? (
            <text key={pt.t} x={xAt(i)} y={height - 6} fontSize="10" textAnchor="middle" fill={T.faint}>
              {fmtTick(pt.t)}
            </text>
          ) : null
        )}
        {cursor != null && (
          <line
            x1={xAt(cursor)}
            y1={4}
            x2={xAt(cursor)}
            y2={height - AXIS_H + 4}
            stroke={T.faint}
            strokeWidth="1"
            opacity="0.5"
          />
        )}
      </svg>
      <TipBox tip={tip ? { ...tip, bound: width } : null} width={170} />
    </div>
  );
}
