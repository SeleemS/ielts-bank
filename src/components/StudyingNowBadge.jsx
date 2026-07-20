import React from 'react';
import {
  initialStudyingNowCount,
  nextStudyingNowCount,
  nextStudyingNowDelay,
  STUDYING_NOW_MAX,
  STUDYING_NOW_MIN,
} from '../lib/studyingNow';

const STORAGE_KEY = 'ielts-bank:studying-now:v1';

function storedCount() {
  try {
    const value = Number(window.sessionStorage.getItem(STORAGE_KEY));
    return value >= STUDYING_NOW_MIN && value <= STUDYING_NOW_MAX
      ? value
      : null;
  } catch {
    return null;
  }
}

function persistCount(value) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // A blocked storage API should not remove the trust signal.
  }
}

export default function StudyingNowBadge() {
  const [count, setCount] = React.useState(32);

  React.useEffect(() => {
    const initial = storedCount() ?? initialStudyingNowCount(Date.now());
    setCount(initial);
    persistCount(initial);

    let timer;
    let stopped = false;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (stopped) return;
        setCount((current) => {
          const next = nextStudyingNowCount(current);
          persistCount(next);
          return next;
        });
        schedule();
      }, nextStudyingNowDelay());
    };
    schedule();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      aria-label={`${count} people studying now`}
      className="pointer-events-none absolute right-14 top-3 z-10 animate-fade-in select-none sm:right-16 md:right-4 md:top-[calc(100%+0.875rem)]"
      data-testid="studying-now-badge"
    >
      {/* Dark glass reads as "live" on the navy hero and on white pages alike,
          so one treatment works everywhere the navbar renders. */}
      <div className="relative flex h-9 items-center gap-2.5 overflow-hidden rounded-full border border-emerald-400/20 bg-slate-950/85 pl-3 pr-3.5 shadow-[0_8px_28px_-8px_rgba(16,185,129,0.35),0_2px_10px_-2px_rgba(2,6,23,0.55)] backdrop-blur-md">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-28 bg-[radial-gradient(ellipse_at_left,rgba(16,185,129,0.45),transparent_72%)]"
        />
        <span
          aria-hidden
          className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        <span aria-hidden className="relative flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400/80 motion-reduce:hidden" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.55)]" />
        </span>

        <span className="relative flex items-baseline gap-1.5">
          {/* Re-keying on the count replays the tick animation, so the number
              visibly updates instead of silently swapping. */}
          <span
            key={count}
            className="animate-count-in text-[15px] font-bold leading-none tabular-nums text-white motion-reduce:animate-none"
          >
            {count}
          </span>
          <span className="hidden text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-emerald-200/90 min-[400px]:inline">
            Studying now
          </span>
        </span>
      </div>
    </div>
  );
}
