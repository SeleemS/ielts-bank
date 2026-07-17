// pages/pricing.js
// Premium pricing page: 3 SKUs, 6-month hero highlighted. Prices shown are the
// global list; the PPP variant is applied automatically server-side at
// checkout from request geo (docs/MONETIZATION.md §3.2) — never client-chosen.
import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Check, Sparkles, Loader2 } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import SignInDialog from '../src/components/auth/SignInDialog';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { getSupabase } from '../lib/supabase';
import { track } from '../src/lib/analytics';

const SITE_URL = 'https://ielts-bank.com';
const PAGE_TITLE = 'IELTS Bank Premium – Unlimited AI Writing & Speaking Scoring';
const PAGE_DESCRIPTION =
  'Upgrade to IELTS Bank Premium: unlimited AI Writing and Speaking band scores with examiner-style feedback, AI examiner minutes, progress tracking and an ad-free experience.';

const PLANS = [
  {
    sku: 'monthly',
    name: 'Monthly',
    price: '$9.99',
    cadence: 'per month',
    note: 'Flexible — cancel anytime',
    hero: false,
  },
  {
    sku: '6month',
    name: '6 Months',
    price: '$29.99',
    cadence: 'every 6 months',
    note: '≈ $5.00/mo — matches a full IELTS study cycle',
    hero: true,
  },
  {
    sku: 'annual',
    name: 'Annual',
    price: '$44.99',
    cadence: 'per year',
    note: '≈ $3.75/mo — best value',
    hero: false,
  },
];

const PERKS = [
  'Unlimited AI Writing scores (fair use) with per-criterion band feedback',
  'Unlimited AI Speaking scores (fair use) from your recordings',
  '60 live AI examiner minutes per month — real-time mock speaking interviews',
  'Progress tracking across attempts',
  'Stronger scoring model + priority processing',
  'Completely ad-free',
];

export default function PricingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPremium, planStatus, renewsAt, hasBillingAccount, loading: planLoading } = usePlan();
  const [busySku, setBusySku] = React.useState(null);
  const [portalBusy, setPortalBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);

  const checkoutStatus = typeof router.query.checkout === 'string' ? router.query.checkout : '';

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
    track('checkout_start', { sku });
    try {
      const headers = await authHeader();
      if (!headers) {
        setSignInOpen(true);
        return;
      }
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ sku }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      if (body.code === 'anonymous_user') {
        setSignInOpen(true);
      } else {
        setError(body.error || 'Could not start checkout. Please try again.');
      }
    } catch {
      setError('Could not start checkout. Please try again.');
    } finally {
      setBusySku(null);
    }
  }

  async function openPortal() {
    setError('');
    setPortalBusy(true);
    try {
      const headers = await authHeader();
      if (!headers) {
        setSignInOpen(true);
        return;
      }
      const res = await fetch('/api/billing/portal', { method: 'POST', headers });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body.error || 'Could not open the billing portal.');
    } catch {
      setError('Could not open the billing portal.');
    } finally {
      setPortalBusy(false);
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
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Get your band score up with unlimited AI feedback
          </h1>
          <p className="mt-3 text-muted-foreground">
            All practice content stays free, forever. Premium unlocks unlimited AI scoring of
            <em> your </em>
            Writing and Speaking with examiner-style, criterion-by-criterion feedback.
          </p>
        </header>

        {checkoutStatus === 'success' ? (
          <div className="mx-auto mt-6 max-w-xl rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-center text-sm text-emerald-900">
            🎉 Payment received — your Premium access is being activated. It can take a few
            seconds; refresh this page if it doesn&apos;t appear.
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

        {isPremium ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <p className="text-lg font-semibold">You&apos;re on Premium ✨</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {planStatus === 'canceled' && renewsAt
                ? `Your plan is canceled and stays active until ${new Date(renewsAt).toLocaleDateString()}.`
                : renewsAt
                  ? `Renews on ${new Date(renewsAt).toLocaleDateString()}.`
                  : 'Thanks for supporting IELTS Bank.'}
            </p>
            {hasBillingAccount ? (
              <button
                type="button"
                onClick={openPortal}
                disabled={portalBusy}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Manage billing
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.sku}
                className={
                  plan.hero
                    ? 'relative border-2 border-primary shadow-lg md:-my-2'
                    : 'relative'
                }
              >
                {plan.hero ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Most popular
                  </span>
                ) : null}
                <CardContent className="flex h-full flex-col p-6">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>{' '}
                    <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.note}</p>
                  <button
                    type="button"
                    onClick={() => startCheckout(plan.sku)}
                    disabled={busySku !== null || planLoading}
                    className={
                      (plan.hero
                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                        : 'border hover:bg-muted') +
                      ' mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60'
                    }
                  >
                    {busySku === plan.sku ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : plan.hero ? (
                      <Sparkles className="h-4 w-4" />
                    ) : null}
                    Get Premium
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mx-auto mt-10 max-w-2xl">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Everything in Premium
          </h3>
          <ul className="mt-4 space-y-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Regional pricing is applied automatically at checkout. Cancel anytime — access
            continues to the end of the paid period. Fair-use limits apply to keep scoring fast
            for everyone. IELTS Bank is not affiliated with or endorsed by the IELTS partners.
          </p>
        </div>
      </main>
      <Footer />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to upgrade"
        description="We’ll email you a one-tap magic link, then bring you straight back here."
        trigger="pricing_upgrade"
      />
    </>
  );
}
