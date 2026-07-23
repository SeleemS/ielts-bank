import * as React from 'react';
import worldMap from '../../lib/data/worldMap.json';
import { T, mapColor, fmtNum, fmtMoney, countryName, flagEmoji, pct } from './theme';
import { useTip, TipBox, TipRow } from './primitives';

// Flat 2D choropleth (the in-dashboard "Map" tab, spec §4 note): country fill
// scales mapBase → mapHigh by engaged visitors; hover shows the DataFast-style
// mini card (visitors / revenue / revenue-per-visitor / conversion); green
// pulses mark countries with sessions active in the last 5 minutes.
export default function FlatMap({ countries, activeCountries, tall = false }) {
  const { tip, show, hide } = useTip();
  const wrapRef = React.useRef(null);

  const byCode = React.useMemo(() => {
    const map = {};
    for (const row of countries || []) map[row.c] = row;
    return map;
  }, [countries]);
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
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: T.ink }}>
          <span>{flagEmoji(country.id)}</span>
          <span>{countryName(country.id)}</span>
          {active ? (
            <span className="font-semibold" style={{ color: T.live }}>
              · {active.n} online
            </span>
          ) : null}
        </div>
        {stats ? (
          <>
            <TipRow swatch={T.line} label="Visitors (engaged)" value={fmtNum(stats.engaged ?? stats.visitors)} />
            <TipRow swatch={T.accent} label="Revenue" value={fmtMoney(stats.revenue_minor || 0)} />
            <div className="my-1 h-px" style={{ background: T.divider }} />
            <TipRow
              label="Revenue/visitor"
              value={fmtMoney((stats.revenue_minor || 0) / Math.max(1, stats.engaged ?? stats.visitors))}
            />
            <TipRow label="Sign-up rate" value={pct(stats.signups || 0, Math.max(1, stats.engaged ?? stats.visitors))} />
          </>
        ) : (
          <div style={{ color: T.faint }}>No visits in this range</div>
        )}
      </div>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={worldMap.viewBox} className={`w-full ${tall ? '' : 'max-h-[300px]'}`} role="img" aria-label="Visitors by country">
        {worldMap.countries.map((country) => {
          const stats = byCode[country.id];
          return (
            <path
              key={country.id + country.name}
              d={country.d}
              fill={stats ? mapColor(metric(stats), max) : T.mapBase}
              stroke={T.panel}
              strokeWidth="0.6"
              onMouseMove={(evt) => hover(evt, country)}
              onMouseLeave={hide}
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
              <circle cx={at[0]} cy={at[1]} r={3} fill={T.live} stroke={T.panel} strokeWidth="1.4" />
            </g>
          );
        })}
      </svg>
      {!tall && (
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.faint }}>
            <span>0</span>
            <span
              className="h-2 w-24 rounded-sm"
              style={{ background: `linear-gradient(to right, ${T.mapBase}, ${T.mapHigh})` }}
            />
            <span>{fmtNum(max)} engaged visitors</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.faint }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: T.live }} />
            active right now
          </div>
        </div>
      )}
      <TipBox tip={tip ? { ...tip, bound: wrapRef.current?.clientWidth } : null} />
    </div>
  );
}
