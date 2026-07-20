import React from 'react';
import { RING_R, RING_C, RING_MS, useCountUp } from './scoreAnimation';

// Animated band-score dial (band out of `max`, default 9). The ring fills and
// the number counts up when `play` flips true; reduced-motion resolves straight
// to the final state. `size` scales the whole thing (ring geometry is a fixed
// 150-unit viewBox; the centre text scales off `size`).
export default function BandDial({ band, max = 9, play, reduced, size = 150, label = 'overall band' }) {
  const shown = useCountUp(Number(band) || 0, play, reduced);
  const filled = play ? Math.min(1, Math.max(0, (Number(band) || 0) / max)) : 0;
  const offset = RING_C * (1 - filled);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 150 150" className="h-full w-full" role="img" aria-label={`Band ${band} out of ${max}`}>
        <circle cx="75" cy="75" r={RING_R} fill="none" strokeWidth="12" className="stroke-secondary" />
        <circle
          cx="75"
          cy="75"
          r={RING_R}
          fill="none"
          strokeWidth="12"
          strokeLinecap="butt"
          transform="rotate(-90 75 75)"
          className="stroke-accent"
          style={{
            strokeDasharray: RING_C,
            strokeDashoffset: offset,
            transition: reduced ? 'none' : `stroke-dashoffset ${RING_MS}ms cubic-bezier(0.22,1,0.36,1)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-extrabold tabular-nums leading-none text-foreground"
          style={{ fontSize: Math.round(size * 0.24) }}
        >
          {shown.toFixed(1)}
        </span>
        <span
          className="mt-1 whitespace-nowrap font-bold uppercase leading-none text-muted-foreground"
          style={{ fontSize: Math.max(9, Math.round(size * 0.06)), letterSpacing: '0.02em' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
