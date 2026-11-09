import * as React from 'react';
import { Check, Compass, Loader2, X } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase';
import { track } from '../../lib/analytics';
import {
  PLAN_BANDS,
  PLAN_DESTINATIONS,
  PLAN_GOALS,
  PLAN_ROLES,
  PLAN_TEST_TYPES,
  buildPlanDismissPatch,
  buildPlanSetupPatch,
  hasAnyAnswer,
  planSetupDone,
  todayIso,
} from '../../lib/planSetup';

const chip = (active) =>
  `inline-flex min-h-[2.5rem] items-center rounded-xl border px-3.5 text-sm font-semibold transition ${
    active
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
  }`;

function ChipGroup({ legend, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={value === option.key}
            onClick={() => onChange(value === option.key ? '' : option.key)}
            className={chip(value === option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Optional profile questions shown once on the dashboard. Sign-up stays
// email-first; this is where goal, exam date and destination get captured.
export default function PlanSetupCard({ user, profile, onProfileChange }) {
  const [answers, setAnswers] = React.useState({
    goal: '',
    testType: '',
    band: '',
    examDate: '',
    destination: '',
    role: '',
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const shown = React.useRef(false);
  const done = planSetupDone(profile);

  React.useEffect(() => {
    if (done || shown.current) return;
    shown.current = true;
    track('plan_setup_shown', { source: 'dashboard' });
  }, [done]);

  if (done || !user?.id) return null;

  const set = (key) => (value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  async function persist(patch) {
    const { data, error: saveError } = await getSupabase()
      .from('users')
      .update(patch)
      .eq('id', user.id)
      .select('display_name, target_band, exam_date, prefs')
      .maybeSingle();
    if (saveError || !data) throw new Error(saveError?.message || 'save failed');
    onProfileChange?.(data);
  }

  async function save(event) {
    event.preventDefault();
    if (!hasAnyAnswer(answers) || busy) return;
    setBusy(true);
    setError('');
    try {
      await persist(buildPlanSetupPatch(profile, answers));
      track('onboarding_answered', {
        source: 'dashboard',
        goal: answers.goal || null,
        test_type: answers.testType || null,
        target_band: answers.band || null,
        has_exam_date: Boolean(answers.examDate),
        destination: answers.destination || null,
        role: answers.role || null,
      });
    } catch {
      setError('Could not save your answers. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    track('plan_setup_dismissed', { source: 'dashboard' });
    try {
      await persist(buildPlanDismissPatch(profile));
    } catch {
      // Dismissing is best-effort: hide it for this visit regardless.
      onProfileChange?.({ prefs: buildPlanDismissPatch(profile).prefs });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-3xl border border-sky-200 bg-sky-50/60 p-5 sm:p-7"
      aria-labelledby="plan-setup-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
            <Compass className="h-4 w-4" /> 30 seconds
          </p>
          <h2 id="plan-setup-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">
            Tell us about your test
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Answer what you can. We use it to set your target, count down to your exam and show the right practice.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Skip these questions"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <form onSubmit={save} className="mt-5 space-y-5">
        <ChipGroup legend="Why are you taking IELTS?" options={PLAN_GOALS} value={answers.goal} onChange={set('goal')} />
        <ChipGroup legend="Which test?" options={PLAN_TEST_TYPES} value={answers.testType} onChange={set('testType')} />
        <ChipGroup
          legend="Target band"
          options={PLAN_BANDS.map((band) => ({ key: band, label: band }))}
          value={answers.band}
          onChange={set('band')}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="plan-setup-exam-date" className="mb-2 block text-sm font-semibold text-slate-900">
              Exam date <span className="font-normal text-slate-500">(if booked)</span>
            </label>
            <input
              id="plan-setup-exam-date"
              type="date"
              min={todayIso()}
              value={answers.examDate}
              onChange={(event) => set('examDate')(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            />
          </div>
          <div>
            <label htmlFor="plan-setup-destination" className="mb-2 block text-sm font-semibold text-slate-900">
              Where do you plan to go?
            </label>
            <select
              id="plan-setup-destination"
              value={answers.destination}
              onChange={(event) => set('destination')(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">Choose…</option>
              {PLAN_DESTINATIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ChipGroup legend="Which describes you?" options={PLAN_ROLES} value={answers.role} onChange={set('role')} />
        {error && (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !hasAnyAnswer(answers)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save my plan
          </button>
          <button type="button" onClick={dismiss} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Skip for now
          </button>
        </div>
      </form>
    </section>
  );
}
