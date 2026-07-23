import * as React from 'react';
import { Card as ShadcnCard, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { T, fmtNum, fmtMoney } from './theme';

export function Panel({ children, className = '', style }) {
  return (
    <section
      className={`rounded-xl border ${className}`}
      style={{ background: T.panel, borderColor: T.border, ...style }}
    >
      {children}
    </section>
  );
}

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <Panel className={className}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-1">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.muted }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[11px]" style={{ color: T.faint }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {right}
        </header>
      )}
      <div className="px-4 pb-4 pt-2">{children}</div>
    </Panel>
  );
}

export function Delta({ pctChange, invert = false }) {
  if (pctChange == null || !Number.isFinite(pctChange)) return null;
  const good = invert ? pctChange <= 0 : pctChange >= 0;
  return (
    <span className="text-[11px] font-semibold" style={{ color: good ? T.up : T.down }}>
      {Math.abs(Math.round(pctChange))}% {pctChange >= 0 ? '↑' : '↓'}
    </span>
  );
}

// KPI metric card (shadcn Card + Badge, dashboard palette): tinted icon chip,
// number-forward value, pill delta, muted context line, hover lift.
export function StatTile({ label, value, deltaPct, invert, sub, icon: Icon, tint = T.line, live }) {
  const good = deltaPct != null && (invert ? deltaPct <= 0 : deltaPct >= 0);
  return (
    <ShadcnCard
      className="group border shadow-none transition-all duration-200 hover:-translate-y-0.5"
      style={{ background: T.panel, borderColor: T.border }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="whitespace-nowrap text-[11px] font-semibold" style={{ color: T.muted }}>
            {label}
          </span>
          {Icon ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
              style={{ background: `${tint}1f`, color: tint }}
            >
              {live ? <LiveDot size={9} /> : <Icon size={16} strokeWidth={2.2} />}
            </span>
          ) : null}
        </div>
        <div className="-mt-2 flex items-baseline gap-2">
          <span className="text-[27px] font-bold leading-9 tracking-tight" style={{ color: T.ink }}>
            {value}
          </span>
          {deltaPct != null && Number.isFinite(deltaPct) && (
            <Badge
              variant="outline"
              className="border-transparent px-1.5 py-0 text-[10px] font-bold"
              style={{
                background: good ? 'rgba(78,166,122,0.14)' : 'rgba(201,106,106,0.14)',
                color: good ? T.up : T.down,
              }}
            >
              {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(Math.round(deltaPct))}%
            </Badge>
          )}
        </div>
        <div className="mt-0.5 h-4 truncate text-[11px]" style={{ color: T.faint }}>
          {sub || ''}
        </div>
      </CardContent>
    </ShadcnCard>
  );
}

export function LiveDot({ size = 7 }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
        style={{ background: T.live }}
      />
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, background: T.live }} />
    </span>
  );
}

// The ranked pill row (DataFast aesthetic): full teal-blue value bar behind,
// short rust revenue bar on top when revenue exists; label + icon ride above
// the bars, value (+ muted suffix) right-aligned.
export function RankedList({ rows, maxRows = 9, valueFmt = fmtNum, emptyLabel = 'No data yet' }) {
  const shown = rows.slice(0, maxRows);
  if (!shown.length) {
    return (
      <div className="flex h-24 items-center justify-center text-[12px]" style={{ color: T.faint }}>
        {emptyLabel}
      </div>
    );
  }
  const maxValue = Math.max(1, ...shown.map((row) => row.value));
  const maxRevenue = Math.max(1, ...shown.map((row) => row.revenue || 0));
  return (
    <div className="space-y-1.5">
      {shown.map((row) => (
        <div
          key={row.label}
          className="relative h-[26px] overflow-hidden rounded-md"
          style={{ background: T.panelHover }}
          title={
            row.revenue
              ? `${row.label} — ${valueFmt(row.value)} · ${fmtMoney(row.revenue)} revenue`
              : `${row.label} — ${valueFmt(row.value)}`
          }
        >
          <div
            className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
            style={{ width: `${Math.max(2, (100 * row.value) / maxValue)}%`, background: T.barVisitors }}
          />
          {row.revenue > 0 && (
            <div
              className="absolute bottom-0 left-0 h-[9px] rounded-sm transition-[width] duration-500"
              style={{ width: `${Math.max(2, (100 * row.revenue) / maxRevenue)}%`, background: T.barRevenue }}
            />
          )}
          <div className="relative z-10 flex h-full items-center justify-between px-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium" style={{ color: T.ink }}>
              {row.icon ? <span className="text-[13px] leading-none">{row.icon}</span> : null}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 pl-2 text-[12px] font-semibold tabular-nums" style={{ color: T.ink }}>
              {valueFmt(row.value)}
              {row.revenue > 0 ? (
                <span className="ml-1.5 font-medium" style={{ color: T.accent }}>
                  {fmtMoney(row.revenue)}
                </span>
              ) : null}
              {row.suffix ? (
                <span className="ml-1.5 font-normal" style={{ color: T.faint }}>
                  {row.suffix}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Tiny live sparkline (events per minute, last hour) with a glowing endpoint.
export function Sparkline({ points, width = 200, height = 34 }) {
  const values = (points || []).map((pt) => pt.events || 0);
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const yAt = (value) => height - 3 - (height - 8) * (value / max);
  const line = values.map((value, i) => `${i ? 'L' : 'M'}${(i * stepX).toFixed(1)},${yAt(value).toFixed(1)}`).join('');
  const lastX = (values.length - 1) * stepX;
  const lastY = yAt(values[values.length - 1]);
  return (
    <svg width={width} height={height} aria-hidden className="block">
      <path d={`${line}L${lastX},${height}L0,${height}Z`} fill={T.line} opacity="0.08" />
      <path d={line} fill="none" stroke={T.line} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4.5" fill={T.live} opacity="0.25">
        <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={lastX} cy={lastY} r="2.4" fill={T.live} />
    </svg>
  );
}

export function useTip() {
  const [tip, setTip] = React.useState(null);
  const show = React.useCallback((x, y, content) => setTip({ x, y, content }), []);
  const hide = React.useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function TipBox({ tip, width = 210 }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-30 rounded-lg border px-3 py-2 text-[11px] shadow-2xl"
      style={{
        left: Math.max(4, Math.min(tip.x + 12, (tip.bound || 640) - width)),
        top: Math.max(4, tip.y - 8),
        background: T.panelHover,
        borderColor: T.border,
        color: T.muted,
        maxWidth: width,
      }}
    >
      {tip.content}
    </div>
  );
}

export function TipRow({ swatch, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-px">
      <span className="flex items-center gap-1.5 truncate" style={{ color: T.muted }}>
        {swatch ? <span className="inline-block h-2 w-2 rounded-sm" style={{ background: swatch }} /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold tabular-nums" style={{ color: T.ink }}>
        {value}
      </span>
    </div>
  );
}
