import FeedbackPreview from './FeedbackPreview';
import { OFFER_VERSION } from '../../lib/monetizationExperiment';
import * as React from 'react';
import NextLink from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { isPppCountry } from '../../lib/billing';
import { buildUpgradeHref } from '../../lib/upgradeContext';
import { EXAM_PASS_DAYS, money, planPricing } from '../lib/saleConfig';
import { track } from '../lib/analytics';

// What Pro adds to the NEXT report, stated as concretely as the free result
// allows. `locked` comes from the free payload (reduceForFree in
// pages/api/score/writing.js): how many corrections were held back and whether
// a Band 8 rewrite exists. Counts describe THIS essay, which is why the copy is
// careful to say Pro applies to the next essay — an old sample never unlocks.
export function lockedValueLines(skill, locked = {}) {
  if (skill === 'speaking') {
    return [
      'Full Speaking reports on your next recordings',
      'Minutes with the live AI examiner for a full 3-part interview',
      'Timed full mock tests and band trends on your dashboard',
    ];
  }
  const corrections = Number.isFinite(locked.corrections) && locked.corrections > 0
    ? locked.corrections
    : 0;
  return [
    corrections > 0
      ? `Every corrected sentence — this essay had ${corrections} more we held back`
      : 'Every corrected sentence, not just the first',
    locked.rewrite
      ? 'A Band 8 rewrite of your weakest paragraph (one was written for this essay)'
      : 'A Band 8 rewrite of your weakest paragraph',
    'The examiner summary and an improvement plan in priority order',
    'Up to 2 full reports a day, 30 a month',
  ];
}

// Plain daily cost of a fixed-length pass — honest arithmetic, not an anchor.
export function perDay(price, days = EXAM_PASS_DAYS) {
  if (!Number.isFinite(price) || !days) return null;
  return money(Math.round((price / days) * 100) / 100);
}

// The single next step after a learner has received a free result. One
// primary action; the monthly option is information, not a competing button.
export default function ExamPassOffer({ skill, source, band, locked, children }) {
  const element = React.useRef(null);
  const viewed = React.useRef(false);
  const [regional, setRegional] = React.useState(false);
  const [returnTo, setReturnTo] = React.useState('');
  React.useEffect(() => {
    const country = document.cookie.match(/(?:^|;\s*)ib_country=([A-Z]{2})/)?.[1];
    setRegional(isPppCountry(country));
    setReturnTo(window.location.pathname);
  }, []);
  React.useEffect(() => {
    const record = () => {
      if (viewed.current) return;
      viewed.current = true;
      track('exam_pass_offer_view', { skill, source, sku: 'exam_pass', stage: 'sample', offer_version: OFFER_VERSION });
    };
    if (typeof IntersectionObserver === 'undefined') { record(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) { record(); observer.disconnect(); }
    }, { threshold: 0.5 });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [skill, source]);
  const href = buildUpgradeHref({ upgrade: skill, stage: 'sample', return_to: returnTo });
  const price = planPricing('exam_pass', regional);
  const monthly = planPricing('monthly', regional);
  const speaking = skill === 'speaking';
  const next = speaking ? 'recording' : 'essay';
  const daily = perDay(price.price, price.days || EXAM_PASS_DAYS);
  return (
    <section ref={element} aria-label="30-day Exam Pass" className="rounded-xl border-2 border-accent/40 bg-accent/[0.04] p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">Your free sample is done</p>
      <h3 className="mt-2 text-lg font-bold text-foreground sm:text-xl">
        Get the full report on your next {next}
      </h3>
      {children ? <p className="mt-2 text-sm text-muted-foreground">{children}</p> : null}
      <p className="mt-3 text-sm font-semibold text-foreground">Pro adds to every report:</p>
      <ul className="mt-2 space-y-2">
        {lockedValueLines(skill, locked).map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
        <p className="text-base font-bold text-foreground">
          Exam Pass · {money(price.price)} USD, one payment
        </p>
        <p className="text-sm text-muted-foreground">
          {EXAM_PASS_DAYS} days of Pro{daily ? ` (about ${daily} a day)` : ''}. No automatic renewal. Scoring limits apply.
        </p>
        <Button asChild variant="accent" size="lg" className="mt-3 w-full sm:w-auto sm:self-start">
          <NextLink href={href} className="no-underline" onClick={() => {
            track('exam_pass_offer_click', { skill, source, sku: 'exam_pass', stage: 'sample', offer_version: OFFER_VERSION });
            track('paywall_upgrade_click', { skill, source, band });
          }}>Continue to the Exam Pass <ArrowRight className="h-4 w-4" aria-hidden="true" /></NextLink>
        </Button>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          14-day money-back guarantee · secure checkout by Stripe
        </p>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Prefer a subscription? Monthly is {money(monthly.price)} USD/month, renewing until canceled, with the same scoring limits.
        Pro applies to the {next}s you score next — this free sample stays as it is.
      </p>
      <FeedbackPreview skill={skill} />
    </section>
  );
}
