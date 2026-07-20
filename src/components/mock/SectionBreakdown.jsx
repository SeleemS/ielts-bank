import React from 'react';
import { ListChecks, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BAR_MS, BAR_STAGGER_MS } from './scoreAnimation';

// Animated per-section score bars. Each section is { label, correct, total,
// weak? }; a weak section renders amber. Bars fill when `play` flips true, with
// a small stagger; reduced-motion resolves straight to the final widths. An
// optional `note` (e.g. "Section 3 was your weakest") renders in amber below.
export default function SectionBreakdown({
  sections,
  play,
  reduced,
  heading = 'Where your marks went',
  note,
  className,
}) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ListChecks className="h-4 w-4" aria-hidden />
        {heading}
      </div>
      <div className="mt-3 space-y-2.5">
        {sections.map((s, i) => {
          const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
          return (
            <div key={s.label} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-3">
              <span className="truncate text-xs text-muted-foreground">{s.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-secondary">
                <span
                  className={cn('block h-full rounded-full', s.weak ? 'bg-amber-500' : 'bg-accent')}
                  style={{
                    width: play ? `${pct}%` : '0%',
                    transition: reduced
                      ? 'none'
                      : `width ${BAR_MS}ms cubic-bezier(0.22,1,0.36,1) ${i * BAR_STAGGER_MS}ms`,
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
      {note ? (
        <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          <Target className="h-3.5 w-3.5" aria-hidden />
          {note}
        </div>
      ) : null}
    </div>
  );
}
