import FeedbackPreview from './FeedbackPreview';
import { OFFER_VERSION } from '../../lib/monetizationExperiment';
import * as React from 'react';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { buildUpgradeHref } from '../../lib/upgradeContext';
import { EXAM_PASS_DAYS, PASS_FIRST_LABEL, money, planPricing } from '../lib/saleConfig';
import { useVisitorMarket } from '../lib/useVisitorMarket';
import { track } from '../lib/analytics';

// A single, inline next step after the learner has received a free result.
// Feedback withheld from an old sample is not retroactively unlocked.
export default function ExamPassOffer({ skill, source, band, children }) {
  const element = React.useRef(null);
  const viewed = React.useRef(false);
  const passFirstRef = React.useRef(false);
  const { ppp: regional, passFirst } = useVisitorMarket();
  const [returnTo, setReturnTo] = React.useState('');
  React.useEffect(() => {
    setReturnTo(window.location.pathname);
  }, []);
  React.useEffect(() => {
    const record = () => {
      if (viewed.current) return;
      viewed.current = true;
      track('exam_pass_offer_view', { skill, source, sku: 'exam_pass', stage: 'sample', offer_version: OFFER_VERSION, pass_first: passFirstRef.current });
    };
    if (typeof IntersectionObserver === 'undefined') { record(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) { record(); observer.disconnect(); }
    }, { threshold: 0.5 });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [skill, source]);
  passFirstRef.current = passFirst;
  const href = buildUpgradeHref({ upgrade: skill, stage: 'sample', return_to: returnTo });
  const price = planPricing('exam_pass', regional);
  const monthly = planPricing('monthly', regional);
  return (
    <section ref={element} aria-label={`${EXAM_PASS_DAYS}-day Exam Pass`} className="rounded-xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-primary">Your next step</p>
      <h3 className="mt-2 text-lg font-bold text-foreground">Know what to improve in your next answer</h3>
      {children ? <p className="mt-2 text-sm text-muted-foreground">{children}</p> : null}
      <p className="mt-2 text-sm text-muted-foreground">
        Get full {skill === 'speaking' ? 'Speaking reports on your next recordings' : 'Writing reports on your next essays'},
        plus timed mocks, progress tracking and live AI examiner practice.
      </p>
      <FeedbackPreview skill={skill} />
      <p className="mt-3 font-semibold text-foreground">
        Exam Pass · {money(price.price)} USD · {passFirst ? PASS_FIRST_LABEL : 'one payment'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{EXAM_PASS_DAYS} days of Pro. No automatic renewal. Scoring limits apply.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {passFirst ? 'Prefer a subscription? ' : 'Or '}Monthly at {money(monthly.price)} USD/month, renewing until canceled. Both include the same scoring limits.
      </p>
      <Button asChild variant="accent" className="mt-4 w-full sm:w-auto">
        <NextLink href={href} className="no-underline" onClick={() => {
          track('exam_pass_offer_click', { skill, source, sku: 'exam_pass', stage: 'sample', offer_version: OFFER_VERSION, pass_first: passFirst });
          track('paywall_upgrade_click', { skill, source, band });
        }}>Compare feedback plans <ArrowRight className="h-4 w-4" aria-hidden="true" /></NextLink>
      </Button>
    </section>
  );
}
