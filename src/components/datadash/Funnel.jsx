import * as React from 'react';
import { T, fmtNum, pct } from './theme';

const STAGES = [
  { key: 'visited', label: 'Visited' },
  { key: 'engaged', label: 'Engaged with a question' },
  { key: 'submitted', label: 'Submitted practice' },
  { key: 'signed_up', label: 'Signed up / in' },
  { key: 'saw_gate', label: 'Hit a paywall gate' },
  { key: 'upgrade_click', label: 'Clicked upgrade' },
  { key: 'checkout', label: 'Started checkout' },
  { key: 'purchased', label: 'Paid', accent: true },
];

// Conversion funnel: distinct visitors reaching each stage. Single hue for
// the journey; the money stage wears the revenue accent.
export default function Funnel({ funnel }) {
  const data = funnel || {};
  const top = Math.max(1, data.visited || 0);
  return (
    <div className="space-y-[9px]">
      {STAGES.map((stage, index) => {
        const value = data[stage.key] || 0;
        const prev = index === 0 ? value : data[STAGES[index - 1].key] || 0;
        return (
          <div key={stage.key}>
            <div className="mb-0.5 flex items-baseline justify-between text-[12px]">
              <span style={{ color: T.muted }}>{stage.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold" style={{ color: T.ink }}>
                  {fmtNum(value)}
                </span>
                <span className="ml-1.5" style={{ color: T.faint }}>
                  {index === 0 ? '100%' : `${pct(value, top)} · ${pct(value, Math.max(prev, 1))} of prev`}
                </span>
              </span>
            </div>
            <div className="h-[9px] overflow-hidden rounded-full" style={{ background: T.panelHover }}>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(0.8, (100 * value) / top)}%`,
                  background: stage.accent ? T.accent : T.barVisitors,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
