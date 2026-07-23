import * as React from 'react';
import { T, fmtNum, fmtMoney } from './theme';
import { useTip, TipBox, TipRow } from './primitives';

const PAD = { left: 40, right: 46, top: 14, bottom: 26 };

function niceMax(value) {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const mult of [1, 2, 2.5, 5, 10]) if (mult * pow >= value) return mult * pow;
  return 10 * pow;
}

// Monotone cubic interpolation → smooth line that never overshoots the data.
function monotonePath(points) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0][0]},${points[0][1]}`;
  const dxs = [], dys = [], ms = [];
  for (let i = 0; i < n - 1; i += 1) {
    dxs.push(points[i + 1][0] - points[i][0]);
    dys.push(points[i + 1][1] - points[i][1]);
    ms.push(dys[i] / (dxs[i] || 1));
  }
  const t = [ms[0]];
  for (let i = 1; i < n - 1; i += 1) {
    if (ms[i - 1] * ms[i] <= 0) t.push(0);
    else {
      const dx = dxs[i - 1] + dxs[i];
      t.push((3 * dx) / ((dx + dxs[i]) / ms[i - 1] + (dx + dxs[i - 1]) / ms[i]));
    }
  }
  t.push(ms[n - 2]);
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const dx = dxs[i] / 3;
    d += `C${points[i][0] + dx},${points[i][1] + dx * t[i]} ${points[i + 1][0] - dx},${points[i + 1][1] - dx * t[i + 1]} ${points[i + 1][0]},${points[i + 1][1]}`;
  }
  return d;
}

// Combined chart (spec §6): orange revenue columns (right axis, $) behind a
// smooth blue visitors line (left axis) with a soft gradient fill; dashed
// gridlines, muted date ticks, dark hover tooltip listing both series.
export default function ComboChart({ series, bucket, height = 240 }) {
  const { tip, show, hide } = useTip();
  const wrapRef = React.useRef(null);
  const [width, setWidth] = React.useState(760);
  const [cursor, setCursor] = React.useState(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = series || [];
  const plotW = Math.max(60, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = points.length ? plotW / points.length : plotW;
  const barW = Math.min(34, Math.max(6, slot * 0.62));
  const xMid = (index) => PAD.left + slot * index + slot / 2;

  const maxVisitors = niceMax(Math.max(1, ...points.map((p) => p.visitors || 0)));
  const maxRevenue = niceMax(Math.max(100, ...points.map((p) => p.revenue_minor || 0)));
  const yV = (value) => PAD.top + plotH * (1 - (value || 0) / maxVisitors);
  const yR = (value) => PAD.top + plotH * (1 - (value || 0) / maxRevenue);

  const fmtTick = (iso) => {
    const d = new Date(iso);
    return bucket === 'hour'
      ? `${String(d.getUTCHours()).padStart(2, '0')}:00`
      : d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  const linePts = points.map((p, i) => [xMid(i), yV(p.visitors)]);
  const lineD = monotonePath(linePts);
  const areaD = linePts.length
    ? `${lineD}L${linePts[linePts.length - 1][0]},${PAD.top + plotH}L${linePts[0][0]},${PAD.top + plotH}Z`
    : '';

  const onMove = (evt) => {
    if (!points.length) return;
    const bounds = wrapRef.current.getBoundingClientRect();
    const x = evt.clientX - bounds.left;
    const index = Math.max(0, Math.min(points.length - 1, Math.floor((x - PAD.left) / slot)));
    setCursor(index);
    const pt = points[index];
    show(
      Math.min(x, width - 170),
      evt.clientY - bounds.top,
      <div>
        <div className="mb-1 font-semibold" style={{ color: T.ink }}>
          {fmtTick(pt.t)}
          {bucket === 'hour' ? ' UTC' : ''}
        </div>
        <TipRow swatch={T.line} label="Visitors" value={fmtNum(pt.visitors)} />
        <TipRow swatch={T.accent} label="Revenue" value={fmtMoney(pt.revenue_minor)} />
        <TipRow label="Sign-ups" value={fmtNum(pt.signups)} />
        <TipRow label="Submits" value={fmtNum(pt.submits)} />
      </div>
    );
  };

  const tickEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => { setCursor(null); hide(); }}>
      <svg width="100%" height={height} role="img" aria-label="Revenue and visitors over time">
        <defs>
          <linearGradient id="visitorFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.line} stopOpacity="0.22" />
            <stop offset="100%" stopColor={T.line} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            y1={PAD.top + plotH * (1 - f)}
            x2={width - PAD.right}
            y2={PAD.top + plotH * (1 - f)}
            stroke={T.divider}
            strokeDasharray="3 5"
          />
        ))}
        <text x={PAD.left - 6} y={PAD.top + 4} fontSize="10" textAnchor="end" fill={T.faint}>
          {fmtNum(maxVisitors)}
        </text>
        <text x={PAD.left - 6} y={PAD.top + plotH} fontSize="10" textAnchor="end" fill={T.faint}>
          0
        </text>
        <text x={width - PAD.right + 6} y={PAD.top + 4} fontSize="10" fill={T.faint}>
          {fmtMoney(maxRevenue)}
        </text>
        <text x={width - PAD.right + 6} y={PAD.top + plotH} fontSize="10" fill={T.faint}>
          $0
        </text>

        {points.map((pt, i) => {
          const h = Math.max(pt.revenue_minor > 0 ? 3 : 1.5, plotH * ((pt.revenue_minor || 0) / maxRevenue));
          return (
            <rect
              key={pt.t}
              x={xMid(i) - barW / 2}
              y={PAD.top + plotH - h}
              width={barW}
              height={h}
              rx="3"
              fill={T.accent}
              opacity={pt.revenue_minor > 0 ? (cursor === i ? 1 : 0.9) : 0.28}
            />
          );
        })}

        {areaD && <path d={areaD} fill="url(#visitorFill)" />}
        {lineD && <path d={lineD} fill="none" stroke={T.line} strokeWidth="2" strokeLinecap="round" />}

        {points.map((pt, i) =>
          pt.revenue_minor > 0 ? (
            <circle key={`m${pt.t}`} cx={xMid(i)} cy={yV(pt.visitors)} r="4.5" fill={T.accent} stroke={T.panel} strokeWidth="2" />
          ) : null
        )}
        {cursor != null && linePts[cursor] && (
          <>
            <line x1={xMid(cursor)} y1={PAD.top} x2={xMid(cursor)} y2={PAD.top + plotH} stroke={T.faint} opacity="0.45" />
            <circle cx={linePts[cursor][0]} cy={linePts[cursor][1]} r="4" fill={T.line} stroke={T.panel} strokeWidth="2" />
          </>
        )}

        {points.map((pt, i) =>
          i % tickEvery === 0 ? (
            <text key={`t${pt.t}`} x={xMid(i)} y={height - 8} fontSize="10" textAnchor="middle" fill={T.faint}>
              {fmtTick(pt.t)}
            </text>
          ) : null
        )}
      </svg>
      <div className="absolute right-14 top-2 flex items-center gap-3 text-[10px]" style={{ color: T.faint }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: T.line }} /> Visitors
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: T.accent }} /> Revenue
        </span>
      </div>
      <TipBox tip={tip ? { ...tip, bound: width } : null} width={170} />
    </div>
  );
}
