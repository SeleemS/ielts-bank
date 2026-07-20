import React from 'react';
import { Clock3, Target, ListChecks, TrendingUp } from 'lucide-react';

// Animated "what a mock hands back" showcase for the mock-test index. Uses one
// clearly-labelled illustrative example (not real user data) to make the value
// of a full mock — an overall band, a per-section diagnosis, and a rising trend
// — visible before a learner commits an hour to it.
//
// Motion plays once when scrolled into view and is fully suppressed for users
// who prefer reduced motion (they see the final, resolved state immediately).

const BAND_TARGET = 7.0;
const BAND_MAX = 9;
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

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

function useInViewOnce(ref) {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '0px 0px -15% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, inView]);
  return inView;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

// Count 0 → target with an ease-out cubic, once, when `run` flips true. A
// timeout backstop guarantees the final value even if requestAnimationFrame is
// throttled (e.g. the tab is backgrounded mid-animation), so the number can
// never get stuck part-way.
function useCountUp(target, run, reduced, duration = 1300) {
  const [value, setValue] = React.useState(reduced ? target : 0);
  React.useEffect(() => {
    if (!run) return undefined;
    if (reduced) {
      setValue(target);
      return undefined;
    }
    let raf;
    let start;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setValue(target);
    };
    const tick = (ts) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
    const safety = setTimeout(finish, duration + 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [target, run, reduced, duration]);
  return value;
}

function BandDial({ play, reduced }) {
  const band = useCountUp(BAND_TARGET, play, reduced);
  const filled = play ? BAND_TARGET / BAND_MAX : 0;
  const offset = RING_C * (1 - filled);
  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <svg viewBox="0 0 150 150" className="h-full w-full" role="img" aria-label={`Overall band ${BAND_TARGET} out of ${BAND_MAX}`}>
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
            transition: reduced ? 'none' : 'stroke-dashoffset 1.3s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tabular-nums leading-none text-foreground">
          {band.toFixed(1)}
        </span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          overall band
        </span>
      </div>
    </div>
  );
}

function SectionBars({ play, reduced }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ListChecks className="h-4 w-4" aria-hidden />
        Where your marks went
      </div>
      <div className="mt-3 space-y-2.5">
        {SECTIONS.map((s, i) => {
          const pct = Math.round((s.correct / s.total) * 100);
          return (
            <div key={s.label} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-3">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-secondary">
                <span
                  className={`block h-full rounded-full ${s.weak ? 'bg-amber-500' : 'bg-accent'}`}
                  style={{
                    width: play ? `${pct}%` : '0%',
                    transition: reduced ? 'none' : `width 1.1s cubic-bezier(0.22,1,0.36,1) ${i * 0.12}s`,
                  }}
                />
              </span>
              <span className="text-right text-xs font-semibold tabular-nums text-foreground">
                {s.correct}/{s.total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        <Target className="h-3.5 w-3.5" aria-hidden />
        Passage 3 is your weak spot — study it next
      </div>
    </div>
  );
}

function BandTrend({ play, reduced }) {
  // Map the 3 attempts to an SVG polyline; higher band = higher on screen.
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
  // Rough path length for the draw-on animation.
  const len = pts.reduce((acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)), 0) + 4;
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
          Your band is climbing
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">across your last 3 mocks</div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Band rising from 6.0 to 6.5 to 7.0 across three mock attempts">
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
            transition: reduced ? 'none' : 'stroke-dashoffset 1.4s ease-out',
          }}
        />
        {pts.map((p, i) => (
          <g
            key={p.attempt}
            style={{
              opacity: play ? 1 : 0,
              transition: reduced ? 'none' : `opacity 0.4s ease-out ${0.5 + i * 0.16}s`,
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
  const inView = useInViewOnce(ref);
  const play = inView;

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
            <BandDial play={play} reduced={reduced} />
          </div>
          <SectionBars play={play} reduced={reduced} />
        </div>

        <div className="border-t border-border px-5 py-4 sm:px-7">
          <BandTrend play={play} reduced={reduced} />
        </div>
      </div>
    </section>
  );
}
