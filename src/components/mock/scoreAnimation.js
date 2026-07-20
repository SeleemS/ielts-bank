import React from 'react';

// Shared motion primitives + timings for the band-score visuals used by both the
// mock-test marketing showcase (MockValueShowcase) and the real results summary
// (QuestionEngine). Keeping the durations here means the two surfaces animate
// identically.

export const RING_R = 54;
export const RING_C = 2 * Math.PI * RING_R;

// On-load timings (deliberately unhurried).
export const BAND_COUNT_MS = 1900;
export const RING_MS = 1900;
export const BAR_MS = 1600;
export const BAR_STAGGER_MS = 150;
export const TREND_MS = 1900;
export const DOT_BASE_MS = 900;
export const DOT_STAGGER_MS = 200;

const hasRaf = typeof requestAnimationFrame === 'function';

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

// True once the element has scrolled into view (fires once). Used by the
// marketing showcase so motion plays when the section is reached.
export function useInViewOnce(ref) {
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

// True on the frame after mount, so a component that appears already-in-view
// (e.g. the results summary after submitting) still animates from its start
// state. Waits two frames so the browser paints the pre-animation state first.
export function usePlayOnMount() {
  const [play, setPlay] = React.useState(false);
  React.useEffect(() => {
    if (!hasRaf) {
      setPlay(true);
      return undefined;
    }
    let raf1;
    let raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPlay(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  return play;
}

// Count 0 → target with an ease-out cubic, once, when `run` flips true. A
// timeout backstop guarantees the final value even if requestAnimationFrame is
// throttled (backgrounded tab) or unavailable (SSR/jsdom).
export function useCountUp(target, run, reduced, duration = BAND_COUNT_MS) {
  const [value, setValue] = React.useState(reduced ? target : 0);
  React.useEffect(() => {
    if (!run) return undefined;
    if (reduced || !hasRaf) {
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
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [target, run, reduced, duration]);
  return value;
}
