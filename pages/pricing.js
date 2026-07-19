import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import SignInDialog from '../src/components/auth/SignInDialog';
import WritingScoreReport from '../src/components/question/WritingScoreReport';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { getSupabase } from '../lib/supabase';
import { isPppCountry } from '../lib/billing';
import { track } from '../src/lib/analytics';
import { SITE_URL } from '../lib/site';

const PAGE_TITLE = 'IELTS Bank Premium – AI Feedback, Examiner & Mock Tests';
const PAGE_DESCRIPTION =
  'Choose IELTS Bank Premium or a 4-week Exam Pass for full AI Writing feedback, Speaking scoring, live examiner practice, and timed mock tests. Includes a 14-day money-back guarantee.';

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

export default function PricingPage({ regionalPricing = false, country = '' }) {
  const router = useRouter();
  const { user } = useAuth();
  const {
    isPremium,
    planStatus,
    renewsAt,
    expiresAt,
    hasBillingAccount,
    loading: planLoading,
  } = usePlan();
  const [busySku, setBusySku] = React.useState(null);
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [examDate, setExamDate] = React.useState(null);
  const [activation, setActivation] = React.useState('idle');
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

  React.useEffect(() => {
    if (!router.isReady || !upgrade || trackedRef.current.paywall === upgrade) return;
    trackedRef.current.paywall = upgrade;
    track('paywall_view', { source: upgrade });
  }, [router.isReady, upgrade]);

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
    track('purchase_success', { source: upgrade || 'pricing' });
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
        setActivation(response.ok ? 'active' : 'delayed');
      })
      .catch(() => setActivation('delayed'));
  }, [checkoutStatus, sessionId, upgrade, user?.id]);

  async function authHeader() {
    const { data } = await getSupabase().auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }

  async function startCheckout(sku) {
    setError('');
    if (!user) {
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
  }

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={`${SITE_URL}/pricing`} />
      </Head>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10">
        {context ? (
          <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-primary/25 bg-primary/5 p-4 text-center">
            <p className="text-lg font-bold text-foreground">
              <span aria-hidden="true">{context.icon}</span> {context.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{context.body}</p>
          </div>
        ) : null}

        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Know exactly what is holding your IELTS band back
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Keep the free question library. Add full rubric-anchored Writing and Speaking
            feedback, live examiner practice, timed mocks, and trend insights.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4" />
            14-day money-back guarantee
          </div>
          {regionalPricing ? (
            <p className="mt-3 text-sm font-semibold text-primary">
              Priced for your region{country ? ` (${country})` : ''} — your regional rate is shown below.
            </p>
          ) : null}
        </header>

        {checkoutStatus === 'success' ? (
          <>
            <ActivationChecklist upgrade={upgrade} />
            {activation === 'checking' ? (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Confirming Premium access…
              </p>
            ) : null}
            {activation === 'delayed' ? (
              <p className="mt-3 text-center text-sm text-amber-700">
                Payment succeeded and activation is still syncing. Your access will appear shortly.
              </p>
            ) : null}
          </>
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
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {BASE_PLANS.map((plan) => {
              const price = regionalPricing ? plan.pppPrice : plan.globalPrice;
              return (
                <Card
                  key={plan.sku}
                  id={plan.sku === 'exam_pass' ? 'exam-pass' : undefined}
                  className={plan.hero ? 'relative border-2 border-primary shadow-xl' : 'relative'}
                >
                  {plan.hero ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                      Best prep-cycle value
                    </span>
                  ) : null}
                  {plan.pass ? (
                    <span className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      No renewal
                    </span>
                  ) : null}
                  <CardContent className="flex h-full flex-col p-6">
                    <h2 className="text-lg font-semibold">{plan.name}</h2>
                    <p className="mt-2">
                      <span className="text-3xl font-bold">{price}</span>{' '}
                      <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                    </p>
                    <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{plan.note}</p>
                    {plan.hero && examWeeks ? (
                      <p className="mt-3 rounded-lg bg-primary/5 p-2 text-xs font-semibold text-primary">
                        Your test is in {examWeeks} {examWeeks === 1 ? 'week' : 'weeks'} — this plan
                        covers your prep{examDays > 120 ? ' and a retake cycle' : ''}.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant={plan.hero ? 'accent' : 'outline'}
                      onClick={() => startCheckout(plan.sku)}
                      disabled={busySku !== null || planLoading}
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

        <p className="mt-5 text-center text-sm font-medium text-muted-foreground">
          Try one Writing sample score free. Every paid option includes the full Premium toolkit.
        </p>

        <section className="mx-auto mt-16 max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">See the product</p>
            <h2 className="mt-2 text-2xl font-bold">What your full feedback looks like</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This example uses the same report layout you receive after scoring.
            </p>
          </div>
          <div className="mt-6 rounded-xl border bg-card p-5 shadow-sm sm:p-7">
            <WritingScoreReport task={2} result={SAMPLE_FEEDBACK} sample />
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-2xl font-bold">Free practice or Premium feedback?</h2>
          <div className="mt-6 overflow-hidden rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3">Feature</th>
                  <th className="px-4 py-3 text-center">Free</th>
                  <th className="px-4 py-3 text-center">Premium</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, free, premium]) => (
                  <tr key={label} className="border-t">
                    <td className="px-4 py-3 font-medium">{label}</td>
                    <td className="px-4 py-3 text-center">
                      {free ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {premium ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Why not use a generic chatbot?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Generic chatbots can over-score IELTS essays and often skip Task Response. IELTS Bank
              anchors every score to the public band descriptors, criterion by criterion, and shows
              the reasoning and corrections behind the estimate.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="font-bold">What if it is not right for me?</h2>
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

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-center text-2xl font-bold">Everything included</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Regional pricing is selected on the server from request geography and cannot be
              chosen by the browser. Fair-use limits keep scoring responsive. IELTS Bank is not
              affiliated with or endorsed by the IELTS partners.
            </p>
          </div>
        </section>
      </main>
      <Footer />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to upgrade"
        description="Create your account or sign in — you’ll stay right on this page."
        trigger="pricing_upgrade"
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
