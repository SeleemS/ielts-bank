import * as React from 'react';
import { T, mapColor, fmtNum } from './theme';
import { useTip, TipBox } from './primitives';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Hour-of-week activity heatmap (UTC). cells: [{dow: 1-7, hour: 0-23, events}]
export default function HourHeatmap({ cells }) {
  const { tip, show, hide } = useTip();
  const wrapRef = React.useRef(null);

  const grid = React.useMemo(() => {
    const map = {};
    let max = 0;
    for (const cell of cells || []) {
      map[`${cell.dow}-${cell.hour}`] = cell.events;
      if (cell.events > max) max = cell.events;
    }
    return { map, max };
  }, [cells]);

  const hover = (evt, dow, hour, value) => {
    const bounds = wrapRef.current?.getBoundingClientRect();
    show(
      evt.clientX - (bounds?.left || 0),
      evt.clientY - (bounds?.top || 0),
      <div>
        <div className="font-semibold" style={{ color: T.ink }}>
          {DAYS[dow - 1]} {String(hour).padStart(2, '0')}:00–{String((hour + 1) % 24).padStart(2, '0')}:00 UTC
        </div>
        <div style={{ color: T.muted }}>
          <span className="font-semibold" style={{ color: T.ink }}>
            {fmtNum(value || 0)}
          </span>{' '}
          events
        </div>
      </div>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox="0 0 520 168" className="w-full" role="img" aria-label="Activity by hour of week (UTC)">
        {DAYS.map((day, index) => (
          <text key={day} x="26" y={30 + index * 20} fontSize="10" textAnchor="end" fill={T.faint}>
            {day}
          </text>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
          <text key={hour} x={34 + hour * 20 + 9} y="12" fontSize="9" textAnchor="middle" fill={T.faint}>
            {String(hour).padStart(2, '0')}
          </text>
        ))}
        {DAYS.map((_, dayIndex) =>
          Array.from({ length: 24 }, (__, hour) => {
            const value = grid.map[`${dayIndex + 1}-${hour}`] || 0;
            return (
              <rect
                key={`${dayIndex}-${hour}`}
                x={34 + hour * 20}
                y={18 + dayIndex * 20}
                width="18"
                height="18"
                rx="4"
                fill={value ? mapColor(value, grid.max) : T.panelHover}
                onMouseMove={(evt) => hover(evt, dayIndex + 1, hour, value)}
                onMouseLeave={hide}
              />
            );
          })
        )}
      </svg>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]" style={{ color: T.faint }}>
        <span>quiet</span>
        <span
          className="h-2 w-24 rounded-sm"
          style={{ background: `linear-gradient(to right, ${T.mapBase}, ${T.mapHigh})` }}
        />
        <span>busy · hours in UTC</span>
      </div>
      <TipBox tip={tip ? { ...tip, bound: wrapRef.current?.clientWidth } : null} width={190} />
    </div>
  );
}
