import * as React from 'react';
import { T, fmtNum, fmtMoney, fmtDur, pct } from './theme';
import { Panel, Delta, LiveDot } from './primitives';

function Cell({ label, value, delta, invert, live, liveValue }) {
  return (
    <div className="min-w-[105px] flex-1 px-4 py-3">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold" style={{ color: T.muted }}>
        {label}
        {live ? <LiveDot /> : null}
      </div>
      <div className="mt-0.5 text-[26px] font-extrabold leading-8 tracking-tight" style={{ color: T.ink }}>
        {live ? liveValue : value}
      </div>
      <div className="h-4">{!live && delta != null ? <Delta pctChange={delta} invert={invert} /> : null}</div>
    </div>
  );
}

function change(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// Seven equal cells in one rounded panel, thin vertical rules between (spec §6).
export default function KpiStrip({ totals, prev, activeNow, showDeltas }) {
  const t = totals || {};
  const p = prev || {};
  const conversion = t.visitors ? (100 * (t.purchasers || 0)) / t.visitors : 0;
  const prevConversion = p.visitors ? (100 * (p.purchases || 0)) / p.visitors : 0;
  const revenuePerVisitor = t.visitors ? (t.revenue_minor || 0) / t.visitors : 0;
  const bounce = t.sessions_total ? (100 * (t.bounce_sessions || 0)) / t.sessions_total : 0;

  const cells = [
    { label: 'Visitors', value: fmtNum(t.visitors), delta: showDeltas ? change(t.visitors, p.visitors) : null },
    { label: 'Revenue', value: fmtMoney(t.revenue_minor), delta: showDeltas ? change(t.revenue_minor, p.revenue_minor) : null },
    { label: 'Conversion rate', value: pct(t.purchasers || 0, t.visitors || 1), delta: showDeltas ? change(conversion, prevConversion) : null },
    { label: 'Revenue/visitor', value: fmtMoney(revenuePerVisitor), delta: null },
    { label: 'Bounce rate', value: `${Math.round(bounce)}%`, delta: null, invert: true },
    { label: 'Session time', value: fmtDur(t.median_session_secs), delta: null },
    { label: 'Online', live: true, liveValue: activeNow == null ? '–' : fmtNum(activeNow) },
  ];

  return (
    <Panel className="flex flex-wrap overflow-hidden">
      {cells.map((cell, index) => (
        <React.Fragment key={cell.label}>
          {index > 0 && <div className="my-3 hidden w-px lg:block" style={{ background: T.divider }} />}
          <Cell {...cell} />
        </React.Fragment>
      ))}
    </Panel>
  );
}
