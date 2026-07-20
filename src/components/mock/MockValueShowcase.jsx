import React from 'react';
import { Clock3, TrendingUp } from 'lucide-react';
import BandDial from './BandDial';
import SectionBreakdown from './SectionBreakdown';
import {
  useInViewOnce,
  usePrefersReducedMotion,
  TREND_MS,
  DOT_BASE_MS,
  DOT_STAGGER_MS,
} from './scoreAnimation';

// Marketing showcase for the mock-test index: one clearly-labelled illustrative
// example that makes the payoff of a full mock visible (overall band, per-section
// diagnosis, and a rising trend). It shares BandDial + SectionBreakdown with the
// real results summary, so what a learner previews here is what they actually
// get after a mock. Motion plays once when scrolled into view.

// Illustrative Academic Reading example: strong start, a clear weak spot.
const SECTIONS = [
  { label: 'Passage 1', correct: 11, total: 13, weak: false },
  { label: 'Passage 2', correct: 8, total: 13, weak: false },
  { label: 'Passage 3', correct: 4, total: 13, weak: true },
];

const TREND = [
  { attempt: 'Mock 1', band: 6.0 },
  { attempt: 'Mock 2', band: 6.5 },
  { attempt: 'Mock 3', band: 7.0 },
];

function BandTrend({ play, reduced }) {
  const w = 232;
  const h = 68;
  const padX = 24;
  const bands = TREND.map((t) => t.band);
  const min = Math.min(...bands) - 0.4;
  const max = Math.max(...bands) + 0.4;
  const pts = TREND.map((t, i) => {
    const x = padX + (i * (w - padX * 2)) / (TREND.length - 1);
    const y = h - 14 - ((t.band - min) / (max - min)) * (h - 28);
    return { x, y, ...t };
  });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const len =
    pts.reduce(
      (acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)),
      0
    ) + 4;
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
          Your band is climbing
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">across your last 3 mocks</div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label="Band rising from 6.0 to 6.5 to 7.0 across three mock attempts"
      >
        <polyline
          points={poly}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-accent"
          style={{
            strokeDasharray: len,
            strokeDashoffset: play ? 0 : len,
            transition: reduced ? 'none' : `stroke-dashoffset ${TREND_MS}ms ease-out`,
          }}
        />
        {pts.map((p, i) => (
          <g
            key={p.attempt}
            style={{
              opacity: play ? 1 : 0,
              transition: reduced ? 'none' : `opacity 0.4s ease-out ${DOT_BASE_MS + i * DOT_STAGGER_MS}ms`,
            }}
          >
            <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 4} className="fill-accent" />
            <text
              x={p.x}
              y={i === pts.length - 1 ? p.y + 18 : p.y - 9}
              textAnchor="middle"
              className={i === pts.length - 1 ? 'fill-foreground' : 'fill-muted-foreground'}
              style={{ fontSize: i === pts.length - 1 ? 12 : 10, fontWeight: 600 }}
            >
              {p.band.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function MockValueShowcase() {
  const ref = React.useRef(null);
  const reduced = usePrefersReducedMotion();
  const play = useInViewOnce(ref);

  return (
    <section ref={ref} className="mt-12">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">See what you get back</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Every mock ends with a full diagnosis
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Not just a score — an estimated band, a per-section breakdown that pinpoints where marks
          slip, and your progress across attempts.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Example result
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            60:00 · timed conditions
          </span>
        </div>

        <div className="grid items-center gap-6 p-5 sm:p-7 md:grid-cols-[auto_1fr]">
          <div className="flex justify-center md:justify-start">
            <BandDial band={7} play={play} reduced={reduced} size={150} />
          </div>
          <SectionBreakdown
            sections={SECTIONS}
            play={play}
            reduced={reduced}
            note="Passage 3 is your weak spot — study it next"
          />
        </div>

        <div className="border-t border-border px-5 py-4 sm:px-7">
          <BandTrend play={play} reduced={reduced} />
        </div>
      </div>
    </section>
  );
}
