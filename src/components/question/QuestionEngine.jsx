import React, { useMemo, useState, useCallback } from 'react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import QuestionGroup from './QuestionGroup';
import { gradeAll, estimateBand } from './grade';

// The stateful heart of the question-taking experience. It is UI-chrome
// agnostic: Reading and Listening pages supply their own passage/audio layout
// and drop this into the "questions" column.
//
// Props:
//   groups     - structured question_groups (each question carries `number`)
//   storageKey - passage slug (localStorage key for the attempt)
//   skill      - 'reading' | 'listening' (used in the storage key + band label)
//   showBand   - optional; show a rough band estimate in the results summary

function persistAttempt(skill, storageKey, answers, result) {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    const perQuestion = {};
    Object.entries(result.byNumber).forEach(([num, r]) => {
      perQuestion[num] = {
        correct: r.correct,
        answered: r.answered,
        userAnswer: answers[num] ?? null,
        correctDisplay: r.correctDisplay,
      };
    });
    const payload = {
      skill,
      slug: storageKey,
      answers,
      perQuestion,
      score: result.score,
      total: result.total,
      timestamp: new Date().toISOString(),
    };
    window.localStorage.setItem(`ielts-attempt:${skill}:${storageKey}`, JSON.stringify(payload));
  } catch {
    /* localStorage may be unavailable (private mode) — non-fatal */
  }
}

function ResultsSummary({ score, total, skill, showBand, onReset }) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const band = showBand ? estimateBand(score, total) : null;
  return (
    <div className="mb-6 rounded-lg border border-accent/40 bg-accent/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-accent">
            Your results
          </div>
          <div className="mt-1 text-3xl font-bold text-foreground">
            {score}
            <span className="text-xl text-muted-foreground"> / {total}</span>
            <span className="ml-3 text-base font-medium text-muted-foreground">{pct}%</span>
          </div>
          {band != null && (
            <div className="mt-1 text-sm text-muted-foreground">
              Estimated {skill} band ~{band}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={onReset}>
          Try again
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Review your answers below — correct answers are shown in green and each incorrect
        question reveals the right answer.
      </p>
    </div>
  );
}

export default function QuestionEngine({ groups, storageKey, skill = 'reading', showBand = true, className }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);

  const totalQuestions = useMemo(
    () => (groups || []).reduce((acc, g) => acc + (g.questions?.length || 0), 0),
    [groups]
  );

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '')).length,
    [answers]
  );

  const onChange = useCallback(
    (number, value) => {
      if (submitted) return;
      setAnswers((prev) => ({ ...prev, [number]: value }));
    },
    [submitted]
  );

  const handleSubmit = useCallback(() => {
    const result = gradeAll(groups, answers);
    setResults(result);
    setSubmitted(true);
    persistAttempt(skill, storageKey, answers, result);
    if (typeof window !== 'undefined') {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'submit_answer', {
          category: 'User Engagement',
          label: `${skill} submission`,
        });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [groups, answers, skill, storageKey]);

  const handleReset = useCallback(() => {
    setAnswers({});
    setResults(null);
    setSubmitted(false);
  }, []);

  return (
    <div className={cn('tw-root', className)}>
      {submitted && results && (
        <ResultsSummary
          score={results.score}
          total={results.total}
          skill={skill}
          showBand={showBand}
          onReset={handleReset}
        />
      )}

      {(groups || []).map((group) => (
        <QuestionGroup
          key={group.id}
          group={group}
          answers={answers}
          onChange={onChange}
          submitted={submitted}
          results={results}
        />
      ))}

      {!submitted && (
        <div className="sticky bottom-0 -mx-1 mt-2 flex items-center justify-between gap-4 border-t border-border bg-background/95 px-1 py-4 backdrop-blur">
          <span className="text-sm text-muted-foreground">
            {answeredCount} / {totalQuestions} answered
          </span>
          <Button variant="accent" size="lg" onClick={handleSubmit}>
            Submit answers
          </Button>
        </div>
      )}
    </div>
  );
}
