import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import confetti from 'canvas-confetti';
import {
  Mic,
  Square,
  Play,
  Pause,
  Volume2,
  Clock,
  RotateCcw,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import SignInDialog from '../components/auth/SignInDialog';
import { getSupabase } from '../../lib/supabase';

const SITE_URL = 'https://ielts-bank.com';
const SCORE_API = '/api/score/speaking';
const UPLOAD_BUCKET = 'speaking-uploads';
// Hard cap on the recording we upload/score (protects the upstream + storage).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // ~5 MB
// Sensible recording cap for Part 1 / Part 3 answer sets (Part 2 uses the cue
// card's speakSecondsMax).
const DEFAULT_MAX_SECONDS = 240;

// Speaking rubric criteria (matches the scoring API response keys).
const SPEAKING_CRITERIA = [
  ['fluencyCoherence', 'Fluency & Coherence'],
  ['lexicalResource', 'Lexical Resource'],
  ['grammaticalRange', 'Grammatical Range & Accuracy'],
];

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Pick a MediaRecorder mime type the browser actually supports.
function pickMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatBand(band) {
  return typeof band === 'number' ? band.toFixed(1) : '—';
}

function bandTone(band) {
  if (typeof band !== 'number') return 'bg-secondary text-secondary-foreground';
  if (band >= 7) return 'bg-accent text-accent-foreground';
  if (band >= 5.5) return 'bg-primary text-primary-foreground';
  return 'bg-destructive text-destructive-foreground';
}

function BandPill({ band, className }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.75rem] items-center justify-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums',
        bandTone(band),
        className
      )}
    >
      {formatBand(band)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Microphone recorder hook (MediaRecorder -> webm/opus, with timer + caps).
// ---------------------------------------------------------------------------
function useRecorder(maxSeconds) {
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | recording | stopped | error
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const bytesRef = useRef(0);
  const timerRef = useRef(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok = !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    );
    setSupported(ok);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
  }, [clearTimer]);

  const start = useCallback(async () => {
    setError('');
    // Reset any previous recording.
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlob(null);
    setBlobUrl(null);
    setSeconds(0);
    chunksRef.current = [];
    bytesRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          bytesRef.current += e.data.size;
          if (bytesRef.current >= MAX_UPLOAD_BYTES) stop();
        }
      };

      mr.onstop = () => {
        const type = mr.mimeType || mime || 'audio/webm';
        const b = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(b);
        blobUrlRef.current = url;
        setBlob(b);
        setBlobUrl(url);
        setStatus('stopped');
        stopStream();
      };

      // 1s timeslice so we can measure size as we go.
      mr.start(1000);
      setStatus('recording');

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= maxSeconds) stop();
      }, 250);
    } catch {
      setError(
        'Microphone access was blocked. Please allow microphone access in your browser and try again.'
      );
      setStatus('error');
      stopStream();
    }
  }, [maxSeconds, stop, stopStream]);

  const reset = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlob(null);
    setBlobUrl(null);
    setSeconds(0);
    setStatus('idle');
    setError('');
  }, []);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      clearTimer();
      stopStream();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [clearTimer, stopStream]
  );

  return { supported, status, seconds, blob, blobUrl, error, start, stop, reset };
}

// ---------------------------------------------------------------------------
// Examiner audio playback (one clip at a time).
// ---------------------------------------------------------------------------
function useExaminerAudio() {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const toggle = useCallback(
    (url, id) => {
      if (!url) return;
      if (playingId === id && audioRef.current) {
        stop();
        return;
      }
      if (audioRef.current) audioRef.current.pause();
      const a = new Audio(url);
      audioRef.current = a;
      setPlayingId(id);
      a.onended = () => setPlayingId(null);
      a.onerror = () => setPlayingId(null);
      a.play().catch(() => setPlayingId(null));
    },
    [playingId, stop]
  );

  useEffect(
    () => () => {
      if (audioRef.current) audioRef.current.pause();
    },
    []
  );

  return { toggle, stop, playingId };
}

// ---------------------------------------------------------------------------
// Examiner "play question" button.
// ---------------------------------------------------------------------------
function ExaminerButton({ url, id, playingId, onToggle, label = 'Play examiner question' }) {
  const disabled = !url;
  const isPlaying = playingId === id;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => onToggle(url, id)}
      className="shrink-0"
      aria-label={disabled ? 'Examiner audio unavailable' : label}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {isPlaying ? 'Pause' : 'Play'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Shared recorder panel.
// ---------------------------------------------------------------------------
function RecorderPanel({ recorder, maxSeconds, minSeconds }) {
  const { supported, status, seconds, blobUrl, error } = recorder;

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Recording isn’t supported in this browser</p>
            <p className="mt-1">
              Audio recording needs a modern browser with microphone access (try the
              latest Chrome, Edge, Firefox or Safari). You can still read the questions and
              practise out loud.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isRecording = status === 'recording';
  const hasRecording = status === 'stopped' && !!blobUrl;
  const nearMin = minSeconds ? Math.min((seconds / minSeconds) * 100, 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Your recording
        </h2>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-muted-foreground">
          <Clock className="h-4 w-4" />
          {fmtTime(seconds)}
          <span className="text-muted-foreground/70">/ {fmtTime(maxSeconds)}</span>
        </span>
      </div>

      {isRecording && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            Recording…
          </div>
          {minSeconds ? (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    seconds >= minSeconds ? 'bg-accent' : 'bg-primary'
                  )}
                  style={{ width: `${nearMin}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {seconds >= minSeconds
                  ? 'You’ve reached the minimum length — keep going or stop when ready.'
                  : `Aim to speak for at least ${fmtTime(minSeconds)}.`}
              </p>
            </>
          ) : null}
        </div>
      )}

      {hasRecording && (
        <div className="mb-4">
          <audio src={blobUrl} controls className="w-full" />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <Button type="button" variant="accent" onClick={recorder.start}>
            <Mic className="h-4 w-4" />
            {hasRecording ? 'Record again' : 'Start recording'}
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={recorder.stop}>
            <Square className="h-4 w-4" />
            Stop recording
          </Button>
        )}
        {hasRecording && !isRecording && (
          <Button type="button" variant="ghost" onClick={recorder.reset}>
            <RotateCcw className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part 2 preparation timer + notes.
// ---------------------------------------------------------------------------
function PrepTimer({ prepSeconds, notes, onNotesChange }) {
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [left, setLeft] = useState(prepSeconds);
  const intervalRef = useRef(null);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  const startPrep = () => {
    setLeft(prepSeconds);
    setPhase('running');
    const startedAt = Date.now();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = prepSeconds - elapsed;
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setLeft(0);
        setPhase('done');
      } else {
        setLeft(remaining);
      }
    }, 250);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Preparation
        </h2>
        {phase === 'running' && (
          <span className="inline-flex items-center gap-1.5 text-lg font-bold tabular-nums text-accent">
            <Clock className="h-4 w-4" />
            {fmtTime(left)}
          </span>
        )}
      </div>

      {phase === 'idle' && (
        <p className="mb-3 text-sm text-muted-foreground">
          You have {fmtTime(prepSeconds)} to prepare. Make notes below, then start speaking.
        </p>
      )}
      {phase === 'done' && (
        <p className="mb-3 text-sm font-medium text-accent">
          Preparation time is up — start your recording when you’re ready.
        </p>
      )}

      <Textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Jot down a few notes to structure your answer…"
        className="min-h-[120px] resize-y"
        aria-label="Preparation notes"
      />

      {phase === 'idle' && (
        <Button type="button" variant="outline" className="mt-3" onClick={startPrep}>
          <Clock className="h-4 w-4" />
          Start {fmtTime(prepSeconds)} preparation
        </Button>
      )}
      {phase === 'running' && (
        <p className="mt-3 text-xs text-muted-foreground">
          The timer is running. You can begin recording early if you feel ready.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (shared with the writing scorer's visual language).
// ---------------------------------------------------------------------------
function Modal({ open, onClose, title, children, dismissible = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <div className="tw-root fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score report (plain React — NO dangerouslySetInnerHTML of model output).
// ---------------------------------------------------------------------------
function ScoreReport({ result }) {
  const criteria = result.criteria || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const pronunciation = result.pronunciation || {};
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Overall band */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Overall Band
          </div>
          <div className="text-xs text-muted-foreground">IELTS Speaking</div>
        </div>
        <span
          className={cn(
            'inline-flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold tabular-nums',
            bandTone(result.overallBand)
          )}
        >
          {formatBand(result.overallBand)}
        </span>
      </div>

      {/* Per-criterion cards */}
      <div className="space-y-3">
        {SPEAKING_CRITERIA.map(([key, label]) => {
          const c = criteria[key] || {};
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{label}</h3>
                <BandPill band={c.band} />
              </div>
              {c.feedback && (
                <p className="text-sm leading-relaxed text-muted-foreground">{c.feedback}</p>
              )}
            </div>
          );
        })}

        {/* Pronunciation — not assessed by the AI. */}
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-foreground">Pronunciation</h3>
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Not assessed by AI
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {pronunciation.note ||
              'Pronunciation is best judged by a human examiner and is not scored automatically.'}
          </p>
        </div>
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-1.5 text-sm font-bold text-foreground">Examiner Summary</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
        </div>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">How to Improve</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {improvements.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript (collapsible) */}
      {result.transcript && (
        <div className="rounded-lg border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setTranscriptOpen((v) => !v)}
            aria-expanded={transcriptOpen}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <h3 className="text-sm font-bold text-foreground">Transcript of your answer</h3>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                transcriptOpen && 'rotate-180'
              )}
            />
          </button>
          {transcriptOpen && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {result.transcript}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question list (Part 1 & Part 3).
// ---------------------------------------------------------------------------
function QuestionList({ heading, questions, examiner }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
        {heading}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Play each question, then record one continuous answer covering them all.
      </p>
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const id = `q-${i}`;
          return (
            <li
              key={id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-secondary/20 p-3"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-foreground">{q.text}</p>
              </div>
              <ExaminerButton
                url={q.audioUrl}
                id={id}
                playingId={examiner.playingId}
                onToggle={examiner.toggle}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cue card (Part 2).
// ---------------------------------------------------------------------------
function CueCard({ cueCard, examiner }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Cue card
        </h2>
        <ExaminerButton
          url={cueCard.audioUrl}
          id="cue"
          playingId={examiner.playingId}
          onToggle={examiner.toggle}
          label="Play examiner reading the cue card"
        />
      </div>
      <p className="text-base font-bold text-foreground">{cueCard.topic}</p>
      {cueCard.bullets?.length > 0 && (
        <>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">You should say:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
            {cueCard.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}
      {cueCard.explainLine && (
        <p className="mt-3 text-sm italic text-foreground">{cueCard.explainLine}</p>
      )}

      {cueCard.roundOff?.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rounding-off questions
          </p>
          <ul className="space-y-2">
            {cueCard.roundOff.map((q, i) => {
              const id = `ro-${i}`;
              return (
                <li key={id} className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-relaxed text-foreground">{q.text}</p>
                  <ExaminerButton
                    url={q.audioUrl}
                    id={id}
                    playingId={examiner.playingId}
                    onToggle={examiner.toggle}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main practice page.
// ---------------------------------------------------------------------------
const SpeakingQuestion = ({ id: routeId, item, description }) => {
  const { user } = useAuth();
  const examiner = useExaminerAudio();

  const part = item?.part;
  const isPart2 = part === 2;
  const maxSeconds = isPart2 ? item?.cueCard?.speakSecondsMax || 120 : DEFAULT_MAX_SECONDS;
  const minSeconds = isPart2 ? item?.cueCard?.speakSecondsMin || 60 : 0;

  const recorder = useRecorder(maxSeconds);

  const [notes, setNotes] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const partLabel = part ? `Part ${part}` : 'Speaking';
  const topic = item?.topic || item?.title || '';

  const errorForStatus = (statusCode, data) => {
    if (statusCode === 401) return 'Your session has expired. Please sign in again to get feedback.';
    if (statusCode === 403) return 'You don’t have permission to score this recording.';
    if (statusCode === 429)
      return (data && data.error) || 'You’ve reached the scoring limit. Please try again later.';
    if (statusCode === 400)
      return (data && data.error) || 'There was a problem with your submission. Please re-record and try again.';
    if (statusCode === 502)
      return 'The scoring service is temporarily unavailable. Please try again in a moment.';
    return (data && data.error) || 'Failed to score your recording. Please try again.';
  };

  const handleGetFeedback = async () => {
    setErrorMsg('');

    if (!recorder.blob) {
      setErrorMsg('Please record your answer before requesting feedback.');
      return;
    }

    // Sign-in gate.
    if (!user) {
      setSignInOpen(true);
      return;
    }

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'submit_speaking', {
        category: 'User Engagement',
        label: `Speaking Part ${part} Submission`,
      });
    }

    setIsLoading(true);
    try {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setIsLoading(false);
        setSignInOpen(true);
        return;
      }

      // Upload the recording to the owner-only speaking-uploads bucket.
      const blobType = recorder.blob.type || 'audio/webm';
      const ext = blobType.includes('mp4') ? 'mp4' : blobType.includes('ogg') ? 'ogg' : 'webm';
      const audioPath = `${user.id}/${cryptoRandomId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(audioPath, recorder.blob, { contentType: blobType, upsert: false });

      if (uploadError) {
        setIsLoading(false);
        setErrorMsg('Could not upload your recording. Please try again.');
        return;
      }

      // Score against the contract.
      const response = await fetch(SCORE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          passageSlug: item.slug,
          part,
          audioPath,
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON error body */
      }

      if (response.ok && data) {
        setResult(data);
        setFeedbackOpen(true);
        confetti({ spread: 100, particleCount: 200, origin: { y: 0.5 }, zIndex: 3000, scalar: 1.4 });
      } else {
        setErrorMsg(errorForStatus(response.status, data));
      }
    } catch {
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // SEO.
  const pageTitle = topic
    ? `${topic} | IELTS Speaking ${partLabel} Practice | IELTS-Bank`
    : 'IELTS Speaking Practice | IELTS-Bank';
  const metaDescription =
    description ||
    `Practise IELTS Speaking ${partLabel} with an examiner voice and record your answer for instant AI band feedback.`;
  const canonicalUrl = `${SITE_URL}/speakingquestion/${encodeURIComponent(routeId || '')}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    topic || 'IELTS Speaking Practice'
  )}&type=speaking&subtitle=${encodeURIComponent(partLabel)}`;

  if (!item) {
    return (
      <div className="tw-root min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-muted-foreground">Loading question…</h1>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`IELTS Speaking ${partLabel} practice: ${topic}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
      </Head>

      <div className="tw-root flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="emerald">{partLabel}</Badge>
              {item.difficulty && <Badge variant="secondary">{item.difficulty}</Badge>}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{topic}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              IELTS Speaking Practice — AI-Powered Feedback
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: the prompt / cue card / questions */}
            <div className="space-y-6">
              {isPart2 && item.cueCard && (
                <CueCard cueCard={item.cueCard} examiner={examiner} />
              )}
              {part === 1 && item.part1 && (
                <QuestionList
                  heading="Part 1 questions"
                  questions={item.part1.questions}
                  examiner={examiner}
                />
              )}
              {part === 3 && item.part3 && (
                <QuestionList
                  heading="Part 3 discussion questions"
                  questions={item.part3.questions}
                  examiner={examiner}
                />
              )}
            </div>

            {/* Right: prep (Part 2) + recorder */}
            <div className="space-y-6">
              {isPart2 && item.cueCard && (
                <PrepTimer
                  prepSeconds={item.cueCard.prepSeconds || 60}
                  notes={notes}
                  onNotesChange={setNotes}
                />
              )}
              <RecorderPanel
                recorder={recorder}
                maxSeconds={maxSeconds}
                minSeconds={minSeconds}
              />

              {errorMsg && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-col items-stretch gap-2">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={handleGetFeedback}
                  disabled={isLoading || !recorder.blob}
                >
                  {isLoading ? 'Analyzing…' : 'Get AI feedback'}
                </Button>
                {!user && (
                  <p className="text-center text-xs text-muted-foreground">
                    You’ll be asked to sign in (free) to get AI feedback on your speaking.
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>

      {/* Sign-in gate */}
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to get AI feedback on your speaking"
        description="Create a free account to score your recording and track your speaking bands. No password required."
      />

      {/* Feedback modal — structured, plain-text render (no HTML injection) */}
      <Modal
        open={feedbackOpen && !!result}
        onClose={() => setFeedbackOpen(false)}
        title="Your AI Feedback & Score"
      >
        {result && <ScoreReport result={result} />}
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setFeedbackOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Loading modal */}
      <Modal open={isLoading} onClose={() => {}} title="Analyzing your recording" dismissible={false}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-accent" />
          <p className="text-sm text-muted-foreground">
            Transcribing and scoring against the IELTS Speaking rubric.
            <br />
            This can take up to 60 seconds.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default SpeakingQuestion;
