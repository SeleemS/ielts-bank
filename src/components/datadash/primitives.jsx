import * as React from 'react';
import { T, fmtNum } from './theme';

export function Card({ title, subtitle, right, children, className = '', bodyClassName = '' }) {
  return (
    <section
      className={`rounded-xl border ${className}`}
      style={{ background: T.surface, borderColor: T.border }}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-1">
          <div>
            <h2 className="text-[13px] font-semibold tracking-wide" style={{ color: T.ink2 }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="text-[11px] mt-0.5" style={{ color: T.muted }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {right}
        </header>
      )}
      <div className={`px-4 pb-4 pt-2 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, delta, deltaGood, sub }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ background: T.surface, borderColor: T.border }}
    >
      <div className="text-[11px] font-medium" style={{ color: T.muted }}>
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-8" style={{ color: T.ink }}>
          {value}
        </span>
        {delta != null && (
          <span
            className="text-[11px] font-medium"
            style={{ color: deltaGood == null ? T.muted : deltaGood ? T.live : T.down }}
          >
            {delta}
          </span>
        )}
      </div>
      {sub ? (
        <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// Shared single-tooltip machinery: charts report pointer-space coords within
// their wrapping <div className="relative">.
export function useTip() {
  const [tip, setTip] = React.useState(null);
  const show = React.useCallback((x, y, content) => setTip({ x, y, content }), []);
  const hide = React.useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function TipBox({ tip, width = 200 }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border px-2.5 py-2 text-[11px] shadow-xl"
      style={{
        left: Math.max(4, Math.min(tip.x + 12, (tip.bound || 640) - width)),
        top: Math.max(4, tip.y - 8),
        background: '#232322',
        borderColor: T.border,
        color: T.ink2,
        maxWidth: width,
      }}
    >
      {tip.content}
    </div>
  );
}

export function TipRow({ swatch, label, value, line }) {
  return (
    <div className="flex items-center justify-between gap-3 py-px">
      <span className="flex items-center gap-1.5 truncate" style={{ color: T.muted }}>
        {swatch ? (
          line ? (
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: swatch }} />
          ) : (
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: swatch }} />
          )
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold tabular-nums" style={{ color: T.ink }}>
        {value}
      </span>
    </div>
  );
}

// Horizontal bar list — one series, one hue; values direct-labeled at the end
// so nothing depends on hover.
export function HBarList({ rows, color = T.blue, maxRows = 10, valueFmt = fmtNum, subFmt }) {
  const shown = rows.slice(0, maxRows);
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <div className="space-y-2">
      {shown.map((row) => (
        <div key={row.label} className="group">
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5" style={{ color: T.ink2 }}>
              {row.icon ? <span className="text-[13px] leading-none">{row.icon}</span> : null}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium" style={{ color: T.ink }}>
              {valueFmt(row.value)}
              {subFmt && row.sub != null ? (
                <span className="ml-1.5 font-normal" style={{ color: T.muted }}>
                  {subFmt(row.sub, row)}
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-[6px] w-full overflow-hidden rounded-full" style={{ background: T.surfaceRaised }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(1.5, (100 * row.value) / max)}%`, background: row.color || color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LivePulse({ size = 8 }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
        style={{ background: T.live }}
      />
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, background: T.live }} />
    </span>
  );
}
