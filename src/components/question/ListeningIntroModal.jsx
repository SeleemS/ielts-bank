import * as React from 'react';
import { Headphones, ListChecks, FileText, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';

// One-time explainer shown when a user opens a Listening question. The parent
// decides WHETHER to show it (see the pref logic in ListeningQuestion); this
// component only renders the dialog and reports how it was dismissed via
// onClose({ dontShowAgain }).

const STEPS = [
  {
    icon: Headphones,
    title: 'Listen to the recording',
    body: 'Press play and listen carefully. While practising you can replay, pause, and skip back as often as you like.',
  },
  {
    icon: ListChecks,
    title: 'Answer as you listen',
    body: 'The questions follow the order of the recording. Type or select your answers in the panel next to the audio.',
  },
  {
    icon: FileText,
    title: 'Submit and review',
    body: 'Submit to see your score, explanations for every answer, and the full transcript to check what you missed.',
  },
];

const ListeningIntroModal = ({ open, onClose }) => {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const closeButtonRef = React.useRef(null);

  const close = React.useCallback(() => {
    onClose?.({ dontShowAgain });
  }, [onClose, dontShowAgain]);

  // Esc to close + scroll lock while open.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="listening-intro-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl sm:p-7">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="listening-intro-title" className="pr-8 text-lg font-bold text-foreground">
          How Listening practice works
        </h2>

        <ol className="mt-5 space-y-4">
          {STEPS.map(({ icon: Icon, title, body }) => (
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

        <Button variant="accent" className="mt-4 w-full" onClick={close}>
          Got it — start practising
        </Button>
      </div>
    </div>
  );
};

export default ListeningIntroModal;
