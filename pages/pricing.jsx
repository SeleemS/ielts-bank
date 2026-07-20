import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import SignInDialog from '../src/components/auth/SignInDialog';
import WritingScoreReport from '../src/components/question/WritingScoreReport';
import { FaqSection, faqJsonLdFor } from '../src/components/SectionLanding';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { getSupabase, getPublicTrustStats } from '../lib/supabase';
import { isPppCountry } from '../lib/billing';
import { track } from '../src/lib/analytics';
import { PRICING_SEO } from '../lib/pricingSeo';
import { cn } from '../src/lib/utils';

const PAGE_TITLE = PRICING_SEO.title;
const PAGE_DESCRIPTION = PRICING_SEO.description;

const BASE_PLANS = [
  {
    sku: 'monthly',
    name: 'Monthly',
    globalPrice: '$9.99',
    pppPrice: '$3.99',
    cadence: 'per month',
    note: 'Flexible — cancel anytime',
  },
  {
    sku: '6month',
    name: '6 Months',
    globalPrice: '$29.99',
    pppPrice: '$14.99',
    cadence: 'every 6 months',
    note: '≈ $5.00/mo — covers a complete preparation cycle',
    hero: true,
  },
  {
    sku: 'annual',
    name: 'Annual',
    globalPrice: '$44.99',
    pppPrice: '$19.99',
    cadence: 'per year',
    note: 'Covers preparation and a retake cycle',
  },
  {
    sku: 'exam_pass',
    name: 'Exam Pass',
    globalPrice: '$14.99',
    pppPrice: '$6.99',
    cadence: 'one payment · 4 weeks',
    note: 'No subscription and no automatic renewal',
    pass: true,
  },
];

const PERKS = [
  'Full AI Writing reports with all four criteria and corrected examples',
  'AI Speaking scores from your recordings',
  '30–60 live AI examiner minutes per month, depending on regional plan',
  'Full-length timed mock tests with section breakdowns',
  'Writing and Speaking band trends on your dashboard',
  'Stronger scoring model with priority processing',
  'Completely ad-free practice',
];

const COMPARISON = [
  ['Reading and Listening question bank', true, true],
  ['One lifetime Writing sample score', true, true],
  ['Full Writing report and continued scoring', false, true],
  ['AI Speaking scoring and live examiner', false, true],
  ['Timed full-mock mode', false, true],
  ['Writing and Speaking trend insights', false, true],
  ['Ad-free experience', false, true],
];

// Genuine, verifiable trust signals shown near the plans. Every claim here maps
// to real behaviour: Stripe handles checkout (pages/api/billing/checkout.js),
// the refund window is in the Terms, scores are anchored to the public band
// descriptors, and the Exam Pass never renews.
const TRUST_BAND = [
  {
    icon: BadgeCheck,
    title: 'Anchored to the official rubric',
    body: 'Every score maps to the public IELTS band descriptors, criterion by criterion — not a generic guess.',
  },
  {
    icon: ShieldCheck,
    title: '14-day money-back guarantee',
    body: 'Ask within 14 days of your first purchase for a full refund. No forms to fill in.',
  },
  {
    icon: Lock,
    title: 'Secure Stripe checkout',
    body: 'Payments are processed by Stripe. Your card details go straight to them — we never see or store them.',
  },
  {
    icon: RefreshCw,
    title: 'Cancel in one click',
    body: 'Manage or cancel anytime from your account. The Exam Pass is one-time and never auto-renews.',
  },
];

// Real student testimonials go here. Ships EMPTY on purpose — the section below
// renders nothing until this array has entries, so no invented social proof is
// ever shown. To add one, push an object of the shape:
//   { quote: 'Their essay feedback got me from 6 to 7.5.', name: 'Priya R.', detail: 'Band 7.5 · Academic' }
const TESTIMONIALS = [];

// Pricing-specific FAQs. Rendered visibly AND emitted as FAQPage JSON-LD, so the
// two must stay in sync. Copy is factual and mirrors the Terms/refund policy.
const PRICING_FAQS = [
  {
    q: 'Is there really a money-back guarantee?',
    a: 'Yes. If Premium is not right for you, ask within 14 days of your first purchase and we will refund it — no forms and no questions. The full terms are on the billing and refund page.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel a subscription whenever you like and you keep access until the end of the period you have already paid for. The Exam Pass is a one-time purchase that never renews automatically.',
  },
  {
    q: 'What is free, and what needs Premium?',
    a: 'The full Reading and Listening question bank stays free with instant marking, and you get one lifetime Writing sample score. Premium adds full AI Writing reports on all four criteria, AI Speaking scoring, live AI examiner minutes, timed full mocks, trend insights, and an ad-free experience.',
  },
  {
    q: 'How accurate are the AI band scores?',
    a: 'Scores are an estimate marked against the public IELTS band descriptors, criterion by criterion. Treat the band as a guide within about half a band, and use the specific per-criterion feedback and corrected sentences to improve.',
  },
  {
    q: 'Why might my price differ from someone in another country?',
    a: 'Prices are set from the region your request comes from, so learners in lower-income regions pay less. Regional pricing is applied on the server and cannot be selected in the browser.',
  },
  {
    q: 'Is my payment information secure?',
    a: 'Yes. Checkout is handled by Stripe, a PCI-compliant payment provider. Your card details go directly to Stripe — IELTS-Bank never sees or stores them.',
  },
  {
    q: 'Is IELTS-Bank affiliated with the official IELTS test?',
    a: 'No. IELTS-Bank provides original practice material and is not affiliated with or endorsed by the IELTS partners (British Council, IDP or Cambridge Assessment English).',
  },
];

const SAMPLE_FEEDBACK = {
  overallBand: 6.5,
  wordCount: 268,
  criteria: {
    taskResponse: {
      band: 6.5,
      strengths: ['Your position is clear from the introduction.'],
      improvements: ['Develop the remote-work example with a specific consequence.'],
    },
    coherenceCohesion: {
      band: 7,
      strengths: ['Paragraphing creates a logical progression.'],
      improvements: ['Reduce repeated use of “Furthermore”.'],
    },
    lexicalResource: {
      band: 6,
      strengths: ['Topic vocabulary such as “commute” is accurate.'],
      improvements: ['Replace repeated uses of “important” with precise alternatives.'],
    },
    grammaticalRange: {
      band: 6.5,
      strengths: ['You use a useful mix of simple and complex sentences.'],
      improvements: ['Check articles and prepositions in complex clauses.'],
    },
  },
  summary:
    'A well-organised response with a clear position. More specific examples and more precise vocabulary would move it toward Band 7.',
  improvements: [
    'Add a concrete example to each main idea.',
    'Vary repeated linking phrases.',
    'Proofread articles and prepositions.',
  ],
  correctedExamples: [
    {
      original: 'People can do a decision about their work.',
      suggestion: 'People can make an informed decision about their work.',
    },
  ],
};

function daysUntil(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function contextualCopy(upgrade) {
  if (upgrade === 'writing') {
    return {
      icon: '✍️',
      title: 'Your essay is saved and waiting',
      body: 'Unlock your full score and examiner feedback below.',
    };
  }
  if (upgrade === 'speaking') {
    return {
      icon: '🎙️',
      title: 'Your recording is saved and waiting',
      body: 'Unlock your score and full examiner feedback below.',
    };
  }
  return null;
}

function ActivationChecklist({ upgrade }) {
  const first =
    upgrade === 'writing'
      ? { href: '/ielts-writing-checker', label: 'Score the essay you saved' }
      : upgrade === 'speaking'
        ? { href: '/speakingquestion', label: 'Score the recording you saved' }
        : { href: '/ielts-writing-checker', label: 'Score your first essay' };
  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-bold">You&apos;re in. Do this first:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <NextLink href={first.href} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              {first.label}
            </NextLink>
            <NextLink href="/speaking-examiner" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              Meet your live examiner
            </NextLink>
            <NextLink href="/mock-test" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              Sit a timed mock
            </NextLink>
          </div>
        </div>
      </div>
    </div>
  );
}

// Genuine student testimonials, rendered only when TESTIMONIALS has entries.
function Testimonials({ items }) {
  if (!items?.length) return null;
  return (
    <section className="mx-auto mt-20 max-w-5xl">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">In their words</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">What students say</h2>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <figure
            key={t.name ? `${t.name}-${i}` : i}
            className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <Quote className="h-7 w-7 text-accent/40" aria-hidden />
            <blockquote className="mt-3 flex-1 text-sm leading-6 text-foreground">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-5 border-t border-border pt-4">
              <span className="text-sm font-semibold text-foreground">{t.name}</span>
              {t.detail ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">{t.detail}</span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage({ regionalPricing = false, country = '' }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    isPremium,
    planStatus,
    renewsAt,
    expiresAt,
    hasBillingAccount,
    loading: planLoading,
    error: planError,
  } = usePlan();
  const [busySku, setBusySku] = React.useState(null);
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [pendingSku, setPendingSku] = React.useState(null);
  const [examDate, setExamDate] = React.useState(null);
  const [activation, setActivation] = React.useState('idle');
  const [answeredCount, setAnsweredCount] = React.useState(0);
  const trackedRef = React.useRef({ paywall: '', purchase: '' });

  const checkoutStatus = typeof router.query.checkout === 'string' ? router.query.checkout : '';
  const upgrade =
    router.query.upgrade === 'writing' || router.query.upgrade === 'speaking'
      ? router.query.upgrade
      : '';
  const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : '';
  const offer = router.query.offer === 'winback' ? 'winback' : '';
  const context = contextualCopy(upgrade);
  const examDays = daysUntil(examDate);
  const examWeeks = examDays == null ? null : Math.max(1, Math.ceil(examDays / 7));

  const pricingFaqJsonLd = React.useMemo(() => faqJsonLdFor(PRICING_FAQS), []);

  React.useEffect(() => {
    if (!router.isReady || !upgrade || trackedRef.current.paywall === upgrade) return;
    trackedRef.current.paywall = upgrade;
    track('paywall_view', { source: upgrade });
  }, [router.isReady, upgrade]);

  // Live, real social proof: total practice questions answered across all
  // learners. Fetched client-side; renders only if the RPC returns a count.
  React.useEffect(() => {
    let active = true;
    getPublicTrustStats()
      .then((stats) => {
        if (active) setAnsweredCount(Number(stats?.questionsAnswered || 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!user?.id) return;
    getSupabase()
      .from('users')
      .select('exam_date, prefs')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setExamDate(data?.exam_date || data?.prefs?.examDate || null))
      .catch(() => {});
  }, [user?.id]);

  React.useEffect(() => {
    if (checkoutStatus !== 'success' || !sessionId || !user?.id) return;
    if (trackedRef.current.purchase === sessionId) return;
    trackedRef.current.purchase = sessionId;
    setActivation('checking');
    getSupabase()
      .auth.getSession()
      .then(({ data }) =>
        fetch('/api/billing/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data?.session?.access_token || ''}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        })
      )
      .then((response) => {
        if (response.ok) {
          track('purchase_success', { source: upgrade || 'pricing' });
          setActivation('active');
        } else {
          setActivation('delayed');
        }
      })
      .catch(() => setActivation('delayed'));
  }, [checkoutStatus, sessionId, upgrade, user?.id]);

  const authHeader = React.useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, []);

  const startCheckout = React.useCallback(async (sku) => {
    setError('');
    if (!user) {
      setPendingSku(sku);
      setSignInOpen(true);
      return;
    }
    setBusySku(sku);
    track('checkout_start', { sku, source: upgrade || 'pricing', country, ppp: regionalPricing });
    try {
      const headers = await authHeader();
      if (!headers) {
        setSignInOpen(true);
        return;
      }
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ sku, offer }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      if (body.code === 'anonymous_user') setSignInOpen(true);
      else setError(body.error || 'Could not start checkout. Please try again.');
    } catch {
      setError('Could not start checkout. Please try again.');
    } finally {
      setBusySku(null);
    }
  }, [authHeader, country, offer, regionalPricing, upgrade, user]);

  React.useEffect(() => {
    if (!user?.id || signInOpen || !pendingSku) return;
    const sku = pendingSku;
    setPendingSku(null);
    void startCheckout(sku);
  }, [pendingSku, signInOpen, startCheckout, user?.id]);

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={PRICING_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={PRICING_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={PRICING_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={PRICING_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={PRICING_SEO.ogImage} />
        <meta name="twitter:image:alt" content={PRICING_SEO.imageAlt} />
        {pricingFaqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(pricingFaqJsonLd).replace(/</g, '\\u003c'),
            }}
          />
        ) : null}
      </Head>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10">
        {context ? (
          <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-primary/25 bg-primary/5 p-4 text-center">
            <p className="text-lg font-bold text-foreground">
              <span aria-hidden="true">{context.icon}</span> {context.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{context.body}</p>
          </div>
        ) : null}

        <header className="mx-auto max-w-3xl text-center">
          <Badge variant="emerald" className="mb-4">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            IELTS-Bank Premium
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Know exactly what is holding your IELTS band back
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Keep the free question library. Add full rubric-anchored Writing and Speaking
            feedback, live examiner practice, timed mocks, and trend insights.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-accent" />
              14-day money-back guarantee
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-accent" />
              Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-accent" />
              Secure checkout via Stripe
            </span>
          </div>
          {regionalPricing ? (
            <p className="mt-4 text-sm font-semibold text-primary">
              Priced for your region{country ? ` (${country})` : ''} — your regional rate is shown below.
            </p>
          ) : null}
        </header>

        {checkoutStatus === 'success' && activation === 'active' ? (
          <ActivationChecklist upgrade={upgrade} />
        ) : null}
        {checkoutStatus === 'success' && activation !== 'active' ? (
          <div
            role="status"
            className="mx-auto mt-6 max-w-xl rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground"
          >
            {authLoading || (user?.id && sessionId && activation !== 'delayed') ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Confirming Premium access…
              </>
            ) : !sessionId ? (
              'This checkout return is missing its verification reference. Open Pricing from your account and try again.'
            ) : !user?.id ? (
              'Sign in with the account used at checkout to confirm Premium access.'
            ) : (
              'Premium access could not be confirmed yet. If checkout completed, wait a moment and refresh while signed in to the purchasing account.'
            )}
          </div>
        ) : null}
        {checkoutStatus === 'canceled' ? (
          <div className="mx-auto mt-6 max-w-xl rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground">
            Checkout canceled — no charge was made.
          </div>
        ) : null}
        {error ? (
          <div className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900">
            {error}
          </div>
        ) : null}
        {planError ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900">
            {planError} Checkout is temporarily disabled so your existing access is not misrepresented.
          </div>
        ) : null}

        {isPremium ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <p className="text-lg font-semibold">Your Premium tools are active ✨</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {expiresAt
                ? `Your Exam Pass is active until ${new Date(expiresAt).toLocaleDateString()}.`
                : planStatus === 'canceled' && renewsAt
                  ? `Your plan stays active until ${new Date(renewsAt).toLocaleDateString()}.`
                  : renewsAt
                    ? `Renews on ${new Date(renewsAt).toLocaleDateString()}.`
                    : 'Thanks for supporting IELTS Bank.'}
            </p>
            {hasBillingAccount ? (
              <Button asChild variant="outline" className="mt-4">
                <NextLink href="/billing/manage" className="no-underline">
                  Manage billing
                </NextLink>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {BASE_PLANS.map((plan) => {
              const price = regionalPricing ? plan.pppPrice : plan.globalPrice;
              return (
                <Card
                  key={plan.sku}
                  id={plan.sku === 'exam_pass' ? 'exam-pass' : undefined}
                  className={cn(
                    'relative flex flex-col',
                    plan.hero
                      ? 'border-2 border-accent bg-accent/[0.03] shadow-xl ring-1 ring-accent/10'
                      : 'border-border shadow-sm'
                  )}
                >
                  {plan.hero ? (
                    <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground shadow-md">
                      Best value
                    </span>
                  ) : null}
                  {plan.pass ? (
                    <Badge variant="secondary" className="absolute right-4 top-4 uppercase tracking-wide">
                      No renewal
                    </Badge>
                  ) : null}
                  <CardContent className="flex h-full flex-col p-6 pt-7">
                    <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold tracking-tight text-foreground">{price}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">{plan.cadence}</p>
                    <p className="mt-3 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">{plan.note}</p>
                    {plan.hero && examWeeks ? (
                      <p className="mt-3 rounded-lg bg-accent/10 p-2 text-xs font-semibold text-accent">
                        Your test is in {examWeeks} {examWeeks === 1 ? 'week' : 'weeks'} — this plan
                        covers your prep{examDays > 120 ? ' and a retake cycle' : ''}.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant={plan.hero ? 'accent' : 'outline'}
                      aria-label={
                        plan.pass
                          ? 'Get the Exam Pass'
                          : `Choose ${plan.name} plan`
                      }
                      onClick={() => startCheckout(plan.sku)}
                      disabled={busySku !== null || planLoading || Boolean(planError)}
                      className="mt-auto w-full"
                    >
                      {busySku === plan.sku ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : plan.hero ? (
                        <Sparkles className="h-4 w-4" />
                      ) : null}
                      {plan.pass ? 'Get the Exam Pass' : 'Choose this plan'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-center text-sm font-medium text-muted-foreground">
          Try one Writing sample score free. Every paid option includes the full Premium toolkit.
        </p>

        {/* Genuine trust signals — every claim maps to real behaviour. */}
        <section className="mt-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_BAND.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-foreground">{title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          {answeredCount > 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{answeredCount.toLocaleString()}</span>{' '}
              practice questions answered on IELTS-Bank so far.
            </p>
          ) : null}
        </section>

        <section className="mx-auto mt-20 max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">See the product</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">What your full feedback looks like</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This example uses the same report layout you receive after scoring.
            </p>
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <WritingScoreReport task={2} result={SAMPLE_FEEDBACK} sample />
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Free practice or Premium feedback?</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-4 py-3 font-semibold text-foreground sm:px-6">Feature</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Free</th>
                  <th className="px-4 py-3 text-center font-semibold text-accent">Premium</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, free, premium]) => (
                  <tr key={label} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground sm:px-6">{label}</td>
                    <td className="px-4 py-3 text-center">
                      {free ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                      )}
                    </td>
                    <td className="bg-accent/[0.04] px-4 py-3 text-center">
                      {premium ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Everything included</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3.5 text-sm shadow-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span className="text-foreground">{perk}</span>
              </li>
            ))}
          </ul>
        </section>

        <Testimonials items={TESTIMONIALS} />

        <section className="mx-auto mt-20 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="font-bold text-foreground">Why not use a generic chatbot?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Generic chatbots can over-score IELTS essays and often skip Task Response. IELTS Bank
              anchors every score to the public band descriptors, criterion by criterion, and shows
              the reasoning and corrections behind the estimate.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="font-bold text-foreground">What if it is not right for me?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ask within 14 days of your first purchase for a refund. Cancel subscriptions anytime;
              access continues to the end of the paid period. The Exam Pass never auto-renews.
            </p>
            <NextLink href="/termsofservice#billing-refunds" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Read the billing and refund terms <ArrowRight className="h-3.5 w-3.5" />
            </NextLink>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <FaqSection faqs={PRICING_FAQS} />
        </section>

        <div className="mx-auto mt-12 flex max-w-3xl items-start gap-3 rounded-xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Regional pricing is selected on the server from request geography and cannot be
            chosen by the browser. Fair-use limits keep scoring responsive. IELTS Bank is not
            affiliated with or endorsed by the IELTS partners.
          </p>
        </div>
      </main>
      <Footer />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to upgrade"
        description="Create your account or sign in — you’ll stay right on this page."
        trigger="pricing_upgrade"
        redirectOnFinish={false}
      />
    </>
  );
}

export function getServerSideProps({ req }) {
  const country = String(req?.headers?.['x-vercel-ip-country'] || '').toUpperCase();
  return {
    props: {
      country,
      regionalPricing: isPppCountry(country),
    },
  };
}
