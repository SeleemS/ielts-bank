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
      className="pointer-events-none absolute right-14 top-3 z-10 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-primary/95 px-3 text-primary-foreground shadow-lg shadow-slate-950/15 backdrop-blur sm:right-16 md:right-4 md:top-[calc(100%+0.75rem)]"
      data-testid="studying-now-badge"
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)] motion-reduce:animate-none"
      />
      <span className="text-lg font-extrabold tabular-nums leading-none">{count}</span>
      <span className="hidden text-[10px] font-bold uppercase leading-[1.05] tracking-[0.12em] text-slate-200 min-[400px]:inline">
        Studying
        <br />
        now
      </span>
    </div>
  );
}
