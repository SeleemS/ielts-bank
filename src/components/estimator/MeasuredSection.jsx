import React from 'react';
import { BookOpen, Headphones, Clock, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { sanitizeHtml } from '../../../lib/sanitize';
import QuestionGroup from '../question/QuestionGroup';
import AudioPlayer from '../question/AudioPlayer';

const PASSAGE_HTML_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1';

const READING_SOFT_SECONDS = 7 * 60;

function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// A soft, non-blocking reading countdown. Visible; on reaching 0 it swaps to a
// gentle nudge. It NEVER auto-submits and never blocks. It ticks only while
// this component is mounted (i.e. while the reading step is on screen), so it
// naturally pauses when the visitor moves off the step.
function ReadingTimer() {
  const [remaining, setRemaining] = React.useState(READING_SOFT_SECONDS);
  React.useEffect(() => {
    const deadline = Date.now() + READING_SOFT_SECONDS * 1000;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const done = remaining <= 0;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium tabular-nums',
        done
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
          : 'border-border bg-secondary/50 text-foreground'
      )}
      role="status"
      aria-live="polite"
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {done ? (
        <span>Time&apos;s up in the real test — finish up when you&apos;re ready.</span>
      ) : (
        <span>
          <span className="text-muted-foreground">Suggested time</span> {formatClock(remaining)}
        </span>
      )}
    </div>
  );
}

// One measured section (Reading or Listening). Renders the passage/audio, the
// question groups in ANSWERING mode (via QuestionGroup, submitted={false}), a
// non-blocking soft timer for reading, a subtle "Skip this section" link, and
// the primary Continue button. No submit, no review, no free-submit gate.
export default function MeasuredSection({
  skill,
  title,
  groups,
  answers,
  onChange,
  readingBodyHtml,
  listeningAudioUrl,
  progress,
  onContinue,
  onSkip,
  onAudioPlay,
  onAudioEnded,
}) {
  const [flagged, setFlagged] = React.useState([]);
  const toggleFlag = React.useCallback((number) => {
    setFlagged((current) =>
      current.includes(number) ? current.filter((n) => n !== number) : [...current, number]
    );
  }, []);

  const isReading = skill === 'reading';
  const Icon = isReading ? BookOpen : Headphones;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Section header + progress */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
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
        {isReading ? <ReadingTimer /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Passage / audio column */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {isReading ? (
            <div className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Reading passage
                </h3>
              </div>
              <div className="max-h-[45vh] overflow-y-auto px-5 py-4 supports-[height:100dvh]:max-h-[45dvh] lg:max-h-[calc(100dvh-14rem)]">
                <div
                  className={PASSAGE_HTML_CLASS}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(readingBodyHtml || '') }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Headphones className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Recording
                </h3>
              </div>
              <AudioPlayer src={listeningAudioUrl} onPlay={onAudioPlay} onEnded={onAudioEnded} />
              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                In the real test you hear the recording once. Try to play it just once here too.
              </p>
            </div>
          )}
        </div>

        {/* Questions column */}
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Questions</h3>
          </div>
          <div className="px-5 py-4">
            {(groups || []).map((group) => (
              <QuestionGroup
                key={group.id}
                group={group}
                answers={answers}
                onChange={onChange}
                submitted={false}
                results={null}
                flagged={flagged}
                onToggleFlag={toggleFlag}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button variant="accent" size="lg" onClick={onContinue} className="w-full max-w-sm">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
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
