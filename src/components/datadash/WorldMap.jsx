import * as React from 'react';
import worldMap from '../../lib/data/worldMap.json';
import { T, SEQ, seqColor, fmtNum, fmtDurShort, countryName, flagEmoji } from './theme';
import { useTip, TipBox, TipRow } from './primitives';

// Choropleth of the selected range (visitors per country, sqrt scale) with
// live pulses on countries that have an active session right now.
export default function WorldMap({ countries, activeCountries }) {
  const { tip, show, hide } = useTip();
  const wrapRef = React.useRef(null);

  const byCode = React.useMemo(() => {
    const map = {};
    for (const row of countries || []) map[row.c] = row;
    return map;
  }, [countries]);
  // Color by ENGAGED visitors (>=3 events) — raw visitor counts are inflated
  // by JS-executing crawlers that GA/Vercel filter out. Raw stays in tooltip.
  const metric = (row) => row.engaged ?? row.visitors;
  const max = React.useMemo(
    () => Math.max(1, ...(countries || []).map((row) => metric(row))),
    [countries]
  );
  const activeByCode = React.useMemo(() => {
    const map = {};
    for (const row of activeCountries || []) map[row.c] = row;
    return map;
  }, [activeCountries]);

  const hover = (evt, country) => {
    const bounds = wrapRef.current?.getBoundingClientRect();
    const stats = byCode[country.id];
    const active = activeByCode[country.id];
    show(
      evt.clientX - (bounds?.left || 0),
      evt.clientY - (bounds?.top || 0),
      <div>
        <div className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: T.ink }}>
          <span>{flagEmoji(country.id)}</span>
          <span>{countryName(country.id)}</span>
          {active ? (
            <span className="font-medium" style={{ color: T.live }}>
              · {active.n} online
            </span>
          ) : null}
        </div>
        {stats ? (
          <>
            <TipRow label="Engaged (≥3 events)" value={fmtNum(stats.engaged ?? stats.visitors)} />
            <TipRow label="All visitors (incl. bots)" value={fmtNum(stats.visitors)} />
            <TipRow label="Events" value={fmtNum(stats.events)} />
            <TipRow label="Engaged time" value={fmtDurShort(stats.engaged_secs)} />
            <TipRow label="Submits" value={fmtNum(stats.submits)} />
            <TipRow label="Sign-ups" value={fmtNum(stats.signups)} />
          </>
        ) : (
          <div style={{ color: T.muted }}>No visits in this range</div>
        )}
      </div>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={worldMap.viewBox} className="w-full" role="img" aria-label="Visitors by country">
        {worldMap.countries.map((country) => {
          const stats = byCode[country.id];
          return (
            <path
              key={country.id + country.name}
              d={country.d}
              fill={stats ? seqColor(metric(stats), max) : T.surfaceRaised}
              stroke={T.surface}
              strokeWidth="0.6"
              onMouseMove={(evt) => hover(evt, country)}
              onMouseLeave={hide}
              style={{ cursor: stats ? 'pointer' : 'default' }}
            />
          );
        })}
        {(activeCountries || []).map((row) => {
          const at = worldMap.centroids[row.c];
          if (!at) return null;
          const r = Math.min(9, 4 + row.n * 1.5);
          return (
            <g key={row.c} pointerEvents="none">
              <circle cx={at[0]} cy={at[1]} r={r} fill={T.live} opacity="0.25">
                <animate attributeName="r" values={`${r};${r + 7};${r}`} dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0;0.3" dur="2.2s" repeatCount="indefinite" />
              </circle>
              <circle cx={at[0]} cy={at[1]} r={3.2} fill={T.live} stroke={T.surface} strokeWidth="1.4" />
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>
          <span>0</span>
          <div className="flex h-2 overflow-hidden rounded-sm">
            {SEQ.map((step) => (
              <span key={step} className="h-2 w-5" style={{ background: step }} />
            ))}
          </div>
          <span>{fmtNum(max)} engaged visitors</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.muted }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: T.live }} />
          active right now
        </div>
      </div>
      <TipBox tip={tip ? { ...tip, bound: wrapRef.current?.clientWidth } : null} />
    </div>
  );
}
