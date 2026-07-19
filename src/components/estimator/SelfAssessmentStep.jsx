import React from 'react';
import { PenLine, Mic, Check, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { SELF_ASSESSMENT_DISCLAIMER } from '../../../lib/estimatorConfig';

// A self-assessment section (Writing or Speaking): three tap-select questions,
// three options each. All three must be answered to Continue; a subtle "Skip
// this section" opts the whole skill out (renders "Not measured" on results).
export default function SelfAssessmentStep({
  config,
  title,
  answers,
  onChange,
  progress,
  onContinue,
  onSkip,
}) {
  const Icon = config.skill === 'writing' ? PenLine : Mic;
  const allAnswered = (config.questions || []).every((q) => {
    const v = answers?.[q.id];
    return v !== undefined && v !== null && v !== '';
  });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          {progress ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">
              {progress.label}
            </div>
          ) : null}
          <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
        </div>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        We can&apos;t mark {config.skill} from a quick quiz, so answer honestly and we&apos;ll
        estimate a range. {SELF_ASSESSMENT_DISCLAIMER}
      </p>

      <div className="space-y-6">
        {(config.questions || []).map((q) => {
          const selected = answers?.[q.id];
          return (
            <fieldset key={q.id}>
              <legend className="mb-2.5 text-sm font-semibold text-foreground">{q.prompt}</legend>
              <div className="grid gap-2">
                {(q.options || []).map((opt) => {
                  const isChosen = selected === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={isChosen}
                      onClick={() => onChange(q.id, opt.value)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isChosen
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-input text-foreground hover:border-accent/50 hover:bg-secondary'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                          isChosen ? 'border-accent bg-accent text-accent-foreground' : 'border-input'
                        )}
                      >
                        {isChosen ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          variant="accent"
          size="lg"
          onClick={onContinue}
          disabled={!allAnswered}
          className="w-full max-w-sm"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
        {!allAnswered ? (
          <p className="text-xs text-muted-foreground">Answer all three to continue, or skip.</p>
        ) : null}
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip this section
        </button>
      </div>
    </div>
  );
}
