import * as React from 'react';
import {
  Gauge,
  Headphones,
  MessageSquare,
  Mic,
  Timer,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { useDialogFocus } from '../../lib/dialogFocus';

const INTRO_STEPS = [
  {
    icon: Headphones,
    title: 'A real spoken interview',
    body: 'Your examiner speaks and listens in real time, following the real 3-part IELTS format. Find a quiet spot and use headphones if you can.',
  },
  {
    icon: MessageSquare,
    title: 'Just talk naturally',
    body: 'Answer in full sentences and take your time — the examiner waits while you think. Longer, developed answers score better than one-liners.',
  },
  {
    icon: Timer,
    title: 'The cue card (Part 2)',
    body: 'You get one minute to prepare, then speak for up to two minutes. Say “I’m ready” whenever you want to begin early.',
  },
  {
    icon: Gauge,
    title: 'Your band score at the end',
    body: 'The interview ends automatically and your band is marked from the transcript. Speak for at least a couple of minutes so there is enough to assess.',
  },
];

export default function ExaminerIntroModal({ open, onClose, onStart }) {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const dialogRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  const onStartRef = React.useRef(onStart);
  const dontShowAgainRef = React.useRef(dontShowAgain);
  onCloseRef.current = onClose;
  onStartRef.current = onStart;
  dontShowAgainRef.current = dontShowAgain;

  const dismiss = React.useCallback(() => {
    onCloseRef.current?.({
      dontShowAgain: dontShowAgainRef.current,
      start: false,
    });
  }, []);

  const start = React.useCallback(() => {
    onCloseRef.current?.({
      dontShowAgain: dontShowAgainRef.current,
      start: true,
    });
    onStartRef.current?.();
  }, []);

  useDialogFocus({
    active: open,
    containerRef: dialogRef,
    onDismiss: dismiss,
    focusKey: 'examiner-intro',
  });

  React.useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="examiner-intro-title"
      tabIndex={-1}
      data-analytics-id="examiner_intro"
      data-analytics-surface="speaking_examiner"
    >
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
        data-analytics-id="examiner_intro_backdrop"
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          data-dialog-initial-focus
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="examiner-intro-title" className="pr-8 text-lg font-bold text-foreground">
          How the live examiner works
        </h2>
        <ol className="mt-5 space-y-4">
          {INTRO_STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={dontShowAgain} onCheckedChange={setDontShowAgain} />
          Don&rsquo;t show this again
        </label>
        <Button variant="accent" className="mt-4 w-full" onClick={start}>
          <Mic className="h-4 w-4" /> Start my interview
        </Button>
      </div>
    </div>
  );
}
