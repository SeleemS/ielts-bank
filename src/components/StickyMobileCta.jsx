import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { track } from '../lib/analytics';

// Phone-only bottom bar that brings a long page's primary action back into
// reach once the visitor has scrolled past it (e.g. into the sample report or
// FAQ on the Writing checker). It stays hidden while the watched element is on
// screen — no competing duplicate CTA next to the real one — and never renders
// where IntersectionObserver is unavailable.
export default function StickyMobileCta({
  watchRef,
  label,
  hint,
  onActivate,
  hidden = false,
  source = 'sticky_mobile_cta',
}) {
  const [offscreen, setOffscreen] = React.useState(false);

  React.useEffect(() => {
    const el = watchRef?.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setOffscreen(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [watchRef]);

  if (hidden || !offscreen) return null;

  return (
    <div
      data-testid="sticky-mobile-cta"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur sm:hidden"
    >
      <Button
        type="button"
        variant="accent"
        size="lg"
        className="w-full"
        onClick={() => {
          track('sticky_cta_click', { source });
          onActivate?.();
        }}
      >
        {label}
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      {hint ? <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
