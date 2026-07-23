import * as React from 'react';
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

export function Delta({ pctChange, invert = false }) {
  if (pctChange == null || !Number.isFinite(pctChange)) return null;
  const good = invert ? pctChange <= 0 : pctChange >= 0;
  return (
    <span className="text-[11px] font-semibold" style={{ color: good ? T.up : T.down }}>
      {Math.abs(Math.round(pctChange))}% {pctChange >= 0 ? '↑' : '↓'}
    </span>
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

// Segmented tab row (active tab gets the #1D2530 fill, per spec).
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className="rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors"
          style={
            active === tab.key
              ? { background: T.divider, color: T.ink }
              : { color: T.muted }
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SortToggle({ mode, onChange, hasRevenue }) {
  if (!hasRevenue) {
    return (
      <span className="text-[11px] font-medium" style={{ color: T.faint }}>
        Visitors ⇅
      </span>
    );
  }
  return (
    <button
      onClick={() => onChange(mode === 'visitors' ? 'revenue' : 'visitors')}
      className="text-[11px] font-medium hover:underline underline-offset-2"
      style={{ color: T.muted }}
      title="Toggle sort"
    >
      {mode === 'visitors' ? 'Visitors' : 'Revenue'} ⇅
    </button>
  );
}

// The workhorse row (spec §6): a ~26px rounded pill holding two stacked
// horizontal bars — full-width teal-blue "visitors" bar behind, shorter rust
// "revenue" bar on top — label + icon above the bars (z-front), value right.
export function RankedList({ rows, maxRows = 5, valueFmt = fmtNum, emptyLabel = 'No data yet' }) {
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
              ? `${row.label} — ${valueFmt(row.value)} visitors · ${fmtMoney(row.revenue)} revenue`
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
            </span>
          </div>
        </div>
      ))}
    </div>
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
