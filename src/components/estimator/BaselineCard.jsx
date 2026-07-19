import * as React from 'react';
import NextLink from 'next/link';
import { Gauge, ArrowRight } from 'lucide-react';
import { formatBand } from './score';

const RESULT_KEY = 'ielts-estimator-result';

// Overview-tab card shown ONLY when the visitor has a stored Band Estimator
// result in localStorage. SSR-safe: reads localStorage inside an effect after
// mount, so it renders nothing on the server or before hydration. Self-
// contained so the dashboard diff stays tiny.
export default function BaselineCard() {
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(RESULT_KEY);
      if (raw) setResult(JSON.parse(raw));
    } catch {
      /* storage unavailable / bad JSON — show nothing */
    }
  }, []);

  if (!result || typeof result.overall !== 'number') return null;

  const date = result.completedAt
    ? new Date(result.completedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.65)] sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-6">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-black text-slate-900">Baseline estimate</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            You estimated <span className="font-bold text-slate-900">{formatBand(result.overall)} overall</span>
            {date ? ` on ${date}` : ''}. Retake it to see how far you&apos;ve moved.
          </p>
        </div>
      </div>
      <NextLink
        href="/band-estimator"
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 no-underline transition hover:bg-slate-50 sm:mt-0"
      >
        Retake <ArrowRight className="h-4 w-4" />
      </NextLink>
    </div>
  );
}
