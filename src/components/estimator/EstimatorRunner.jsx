import React from 'react';
import { Gauge, ArrowRight, Clock, BookOpen, Headphones, PenLine, Mic } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { track } from '../../lib/analytics';
import { useAuth } from '../../lib/auth';
import {
  ESTIMATOR_VERSION,
  WRITING_SAMPLE_TASK,
  WRITING_SELF_ASSESSMENT,
  SPEAKING_SELF_ASSESSMENT,
} from '../../../lib/estimatorConfig';
import { sectionBand, selfAssessBand, formatBand } from './score';
import {
  STEPS,
  nextStep,
  progressLabel,
  buildResult,
} from './flow';
import MeasuredSection from './MeasuredSection';
import SelfAssessmentStep from './SelfAssessmentStep';
import WritingSampleStep from './WritingSampleStep';
import EstimatorResults from './EstimatorResults';

const IN_PROGRESS_KEY = 'ielts-estimator:v1';
const RESULT_KEY = 'ielts-estimator-result';
const DETAIL_KEY = 'ielts-estimator:v1:detail';
const DEFAULT_TARGET = 7.0;

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readLocal(key) {
  if (typeof window === 'undefined') return null;
  try {
    return safeParse(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function removeLocal(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

const EMPTY_SKIPPED = { reading: false, listening: false, writing: false, speaking: false };

// The thin, self-contained stepper for the Band Estimator. It reuses
// QuestionItem/gradeAll for the measured sections but deliberately does NOT
// mount QuestionEngine — so no free-submit gate, no attempts writes, no
// post-submit review. Everything runs anonymously and client-side.
export default function EstimatorRunner({
  readingGroups = [],
  listeningGroups = [],
  listeningAudioUrl = '',
  readingTitle = '',
  listeningTitle = '',
  readingBodyHtml = '',
}) {
  const { user } = useAuth();
  const signedIn = Boolean(user?.id);

  const [mounted, setMounted] = React.useState(false);
  const [step, setStep] = React.useState('intro');
  const [readingAnswers, setReadingAnswers] = React.useState({});
  const [listeningAnswers, setListeningAnswers] = React.useState({});
  const [writingAnswers, setWritingAnswers] = React.useState({});
  const [speakingAnswers, setSpeakingAnswers] = React.useState({});
  // Writing is MEASURED by default via a short sample; 'selfassess' is the
  // visible opt-out fallback. `writingScored` means the server holds a band for
  // this visitor's anon_id — which the client deliberately cannot read until
  // sign-up reveals it.
  const [writingSample, setWritingSample] = React.useState('');
  const [writingMode, setWritingMode] = React.useState('sample');
  const [writingScored, setWritingScored] = React.useState(false);
  const [skipped, setSkipped] = React.useState(EMPTY_SKIPPED);
  const [lastResult, setLastResult] = React.useState(null);
  const [detail, setDetail] = React.useState(null); // completed run detail (for View results)
  const startedAtRef = React.useRef(null);

  const emit = React.useCallback(
    (event, params = {}) => {
      track(event, { version: ESTIMATOR_VERSION, signed_in: signedIn, ...params });
    },
    [signedIn]
  );

  // ---- Hydrate on mount ---------------------------------------------------
  React.useEffect(() => {
    const storedResult = readLocal(RESULT_KEY);
    setLastResult(storedResult && storedResult.version === ESTIMATOR_VERSION ? storedResult : null);
    const storedDetail = readLocal(DETAIL_KEY);
    setDetail(storedDetail && storedDetail.version === ESTIMATOR_VERSION ? storedDetail : null);
    const saved = readLocal(IN_PROGRESS_KEY);
    if (saved && saved.version === ESTIMATOR_VERSION && saved.step && saved.step !== 'results') {
      setStep(STEPS.includes(saved.step) ? saved.step : 'intro');
      setReadingAnswers(saved.readingAnswers || {});
      setListeningAnswers(saved.listeningAnswers || {});
      setWritingAnswers(saved.writingAnswers || {});
      setSpeakingAnswers(saved.speakingAnswers || {});
      setWritingSample(saved.writingSample || '');
      setWritingMode(saved.writingMode === 'selfassess' ? 'selfassess' : 'sample');
      setWritingScored(Boolean(saved.writingScored));
      setSkipped({ ...EMPTY_SKIPPED, ...(saved.skipped || {}) });
      startedAtRef.current = saved.startedAt || null;
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Debounced persistence of the in-progress run -----------------------
  React.useEffect(() => {
    if (!mounted || step === 'intro' || step === 'results') return undefined;
    const id = window.setTimeout(() => {
      writeLocal(IN_PROGRESS_KEY, {
        version: ESTIMATOR_VERSION,
        step,
        readingAnswers,
        listeningAnswers,
        writingAnswers,
        speakingAnswers,
        writingSample,
        writingMode,
        writingScored,
        skipped,
        startedAt: startedAtRef.current,
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [
    mounted,
    step,
    readingAnswers,
    listeningAnswers,
    writingAnswers,
    speakingAnswers,
    writingSample,
    writingMode,
    writingScored,
    skipped,
  ]);

  // ---- Compute the four section results from current answers/skips --------
  const computeSections = React.useCallback(
    (skipOverride = skipped) => {
      const reading = skipOverride.reading
        ? null
        : sectionBand(readingGroups, readingAnswers, 'reading');
      const listening = skipOverride.listening
        ? null
        : sectionBand(listeningGroups, listeningAnswers, 'listening');
      // A scored sample yields a band the client is not allowed to see, so it is
      // represented as `{ locked: true }` until sign-up reveals it. Falling back
      // to the self-check produces the usual { points, band: {min,max} }.
      const writing = skipOverride.writing
        ? null
        : writingMode === 'sample'
          ? writingScored
            ? { locked: true }
            : null
          : selfAssessBand(writingAnswers, WRITING_SELF_ASSESSMENT);
      const speaking = skipOverride.speaking
        ? null
        : selfAssessBand(speakingAnswers, SPEAKING_SELF_ASSESSMENT);
      return { reading, listening, writing, speaking };
    },
    [
      skipped,
      readingGroups,
      listeningGroups,
      readingAnswers,
      listeningAnswers,
      writingAnswers,
      speakingAnswers,
      writingMode,
      writingScored,
    ]
  );

  const startRun = () => {
    startedAtRef.current = Date.now();
    emit('estimator_start');
    setStep('reading');
  };

  // Fire estimator_section_complete for the section we're leaving.
  const reportSection = (skill, didSkip) => {
    if (didSkip) {
      emit('estimator_section_complete', { skill, skipped: true });
      return;
    }
    if (skill === 'reading' || skill === 'listening') {
      const groups = skill === 'reading' ? readingGroups : listeningGroups;
      const answers = skill === 'reading' ? readingAnswers : listeningAnswers;
      const s = sectionBand(groups, answers, skill);
      emit('estimator_section_complete', {
        skill,
        score: s ? s.raw : 0,
        total: s ? s.total : 0,
        band: s ? s.band : null,
      });
    } else if (skill === 'writing' && writingMode === 'sample') {
      // Measured server-side; the band is withheld from the client, so there is
      // nothing to report here beyond the fact that it was scored.
      emit('estimator_section_complete', { skill, measured: true, locked: true });
    } else {
      const config = skill === 'writing' ? WRITING_SELF_ASSESSMENT : SPEAKING_SELF_ASSESSMENT;
      const answers = skill === 'writing' ? writingAnswers : speakingAnswers;
      const s = selfAssessBand(answers, config);
      emit('estimator_section_complete', {
        skill,
        band_min: s ? s.band.min : null,
        band_max: s ? s.band.max : null,
      });
    }
  };

  // Finish the whole run: compute, persist, fire estimator_complete.
  const finish = (finalSkipped) => {
    const sections = computeSections(finalSkipped);
    // A scored-but-unrevealed Writing sample means the client knows neither the
    // Writing band nor a trustworthy overall — both stay locked until sign-up.
    const writingLocked = Boolean(sections.writing && sections.writing.locked);
    const bands = {
      reading: sections.reading ? sections.reading.band : null,
      listening: sections.listening ? sections.listening.band : null,
      writing: writingLocked ? null : sections.writing ? sections.writing.band : null,
      speaking: sections.speaking ? sections.speaking.band : null,
    };
    const prefillTarget =
      (lastResult && typeof lastResult.targetBand === 'number' && lastResult.targetBand) ||
      DEFAULT_TARGET;
    const result = buildResult({
      reading: bands.reading,
      listening: bands.listening,
      writing: bands.writing,
      speaking: bands.speaking,
      skipped: finalSkipped,
      targetBand: prefillTarget,
      writingLocked,
    });
    const detailSnapshot = {
      ...sections,
      skipped: finalSkipped,
      targetBand: prefillTarget,
      version: ESTIMATOR_VERSION,
    };

    writeLocal(RESULT_KEY, result);
    writeLocal(DETAIL_KEY, detailSnapshot);
    removeLocal(IN_PROGRESS_KEY);
    setLastResult(result);
    setDetail(detailSnapshot);

    const durationSeconds = startedAtRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
      : null;
    emit('estimator_complete', {
      overall_band: result.overall,
      reading_band: bands.reading,
      listening_band: bands.listening,
      writing_locked: writingLocked,
      writing_measured: writingLocked || writingMode === 'sample',
      writing_min: bands.writing ? bands.writing.min : null,
      writing_max: bands.writing ? bands.writing.max : null,
      speaking_min: bands.speaking ? bands.speaking.min : null,
      speaking_max: bands.speaking ? bands.speaking.max : null,
      duration_seconds: durationSeconds,
      sections_skipped: result.sectionsSkipped,
    });

    setStep('results');
  };

  // Advance from a section step: report it, then either move on or finish.
  const advance = (skill, didSkip) => {
    let nextSkipped = skipped;
    if (didSkip) {
      nextSkipped = { ...skipped, [skill]: true };
      setSkipped(nextSkipped);
    }
    reportSection(skill, didSkip);
    if (skill === 'speaking') {
      finish(nextSkipped);
    } else {
      setStep(nextStep(step));
    }
  };

  const resetRun = () => {
    removeLocal(IN_PROGRESS_KEY);
    setReadingAnswers({});
    setListeningAnswers({});
    setWritingAnswers({});
    setSpeakingAnswers({});
    setWritingSample('');
    setWritingMode('sample');
    setWritingScored(false);
    setSkipped(EMPTY_SKIPPED);
    startedAtRef.current = null;
  };

  const handleRetake = () => {
    resetRun();
    startRun();
  };

  // --- Render --------------------------------------------------------------
  if (step === 'reading') {
    return (
      <MeasuredSection
        skill="reading"
        title={readingTitle || 'Reading'}
        groups={readingGroups}
        answers={readingAnswers}
        onChange={(number, value) => setReadingAnswers((prev) => ({ ...prev, [number]: value }))}
        readingBodyHtml={readingBodyHtml}
        progress={progressLabel('reading')}
        onContinue={() => advance('reading', false)}
        onSkip={() => advance('reading', true)}
      />
    );
  }

  if (step === 'listening') {
    return (
      <MeasuredSection
        skill="listening"
        title={listeningTitle || 'Listening'}
        groups={listeningGroups}
        answers={listeningAnswers}
        onChange={(number, value) => setListeningAnswers((prev) => ({ ...prev, [number]: value }))}
        listeningAudioUrl={listeningAudioUrl}
        progress={progressLabel('listening')}
        onContinue={() => advance('listening', false)}
        onSkip={() => advance('listening', true)}
        onAudioPlay={() => emit('audio_play', { skill: 'listening', context: 'estimator' })}
      />
    );
  }

  if (step === 'writing') {
    // Default: a MEASURED short sample. "Skip — rate my own writing" drops back
    // to the original self-check rather than losing the section entirely.
    if (writingMode === 'sample') {
      return (
        <WritingSampleStep
          task={WRITING_SAMPLE_TASK}
          value={writingSample}
          onChange={setWritingSample}
          progress={progressLabel('writing')}
          onScored={({ wordCount }) => {
            setWritingScored(true);
            emit('estimator_writing_sample_scored', { word_count: wordCount });
            advance('writing', false);
          }}
          onSelfAssess={() => {
            setWritingMode('selfassess');
            emit('estimator_writing_self_assess_fallback');
          }}
          onError={(code) => emit('estimator_writing_sample_error', { code })}
        />
      );
    }
    return (
      <SelfAssessmentStep
        config={WRITING_SELF_ASSESSMENT}
        title="Writing self-check"
        answers={writingAnswers}
        onChange={(id, value) => setWritingAnswers((prev) => ({ ...prev, [id]: value }))}
        progress={progressLabel('writing')}
        onContinue={() => advance('writing', false)}
        onSkip={() => advance('writing', true)}
      />
    );
  }

  if (step === 'speaking') {
    return (
      <SelfAssessmentStep
        config={SPEAKING_SELF_ASSESSMENT}
        title="Speaking self-check"
        answers={speakingAnswers}
        onChange={(id, value) => setSpeakingAnswers((prev) => ({ ...prev, [id]: value }))}
        progress={progressLabel('speaking')}
        onContinue={() => advance('speaking', false)}
        onSkip={() => advance('speaking', true)}
      />
    );
  }

  if (step === 'results') {
    const sections = detail || computeSections();
    return (
      <EstimatorResults
        reading={sections.reading}
        listening={sections.listening}
        writing={sections.writing}
        speaking={sections.speaking}
        overall={lastResult ? lastResult.overall : null}
        skipped={sections.skipped || skipped}
        initialTargetBand={(detail && detail.targetBand) || DEFAULT_TARGET}
        onTargetBandChange={(value) => {
          setLastResult((prev) => {
            const next = { ...(prev || {}), targetBand: value };
            writeLocal(RESULT_KEY, next);
            return next;
          });
          setDetail((prev) => (prev ? { ...prev, targetBand: value } : prev));
        }}
        onRetake={handleRetake}
      />
    );
  }

  // --- Intro step ----------------------------------------------------------
  const lastDate = lastResult?.completedAt
    ? new Date(lastResult.completedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
        <Gauge className="h-3.5 w-3.5" /> 15-minute level test
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        What&apos;s your IELTS band right now?
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
        Answer 10 real Reading and 10 real Listening questions, write a short paragraph we actually
        mark, and add a quick Speaking self-check. You&apos;ll get an honest band estimate and a
        clear next step — no sign-up needed to start.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
        {[
          { icon: BookOpen, label: 'Reading', sub: '10 questions' },
          { icon: Headphones, label: 'Listening', sub: '10 questions' },
          { icon: PenLine, label: 'Writing', sub: 'Marked sample' },
          { icon: Mic, label: 'Speaking', sub: 'Self-check' },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-3">
            <Icon className="h-4 w-4 text-accent" />
            <div className="mt-2 text-sm font-semibold text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" /> About 12–15 minutes · results are yours to keep
      </p>

      {mounted && lastResult ? (
        <div className="mt-6 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Your last estimate: <span className="font-semibold text-foreground">
              {formatBand(lastResult.overall)} overall
            </span>
            {lastDate ? ` on ${lastDate}` : ''}
          </span>
          {detail ? (
            <button
              type="button"
              onClick={() => setStep('results')}
              className="ml-3 font-medium text-accent underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View results
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          variant="accent"
          size="lg"
          onClick={lastResult ? handleRetake : startRun}
          className="w-full max-w-sm"
        >
          {lastResult ? 'Retake the test' : 'Start the test'} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
