import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { CalendarClock, CreditCard, Loader2, PauseCircle, ShieldCheck } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../src/lib/auth';
import { usePlan } from '../../src/lib/usePlan';
import { getSupabase } from '../../lib/supabase';
import { track } from '../../src/lib/analytics';
import { billingStatusMessage, canOfferBillingPause } from '../../src/lib/billingStatus';

async function authHeaders() {
  const { data } = await getSupabase().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  return { Authorization: `Bearer ${token}` };
}

export default function ManageBillingPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    isPremium,
    planStatus,
    renewsAt,
    expiresAt,
    pauseUntil,
    pauseUsedAt,
    hasBillingAccount,
    loading,
    error: planError,
  } = usePlan();
  const [busy, setBusy] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [pauseResult, setPauseResult] = React.useState(null);

  async function openPortal() {
    setBusy('portal');
    setError('');
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error || 'Could not open billing settings.');
      window.location.assign(body.url);
    } catch (portalError) {
      setError(portalError.message);
      setBusy('');
    }
  }

  async function pausePlan() {
    setBusy('pause');
    setError('');
    try {
      const response = await fetch('/api/billing/pause', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not pause the subscription.');
      track('subscription_pause', { source: 'billing_interstitial' });
      setPauseResult({
        resumesAt: body.resumesAt,
        usedAt: new Date().toISOString(),
      });
      setMessage(`Billing and Premium access are paused until ${new Date(body.resumesAt).toLocaleDateString()}.`);
    } catch (pauseError) {
      setError(pauseError.message);
    } finally {
      setBusy('');
    }
  }

  const pending = authLoading || loading;
  const effectivePauseUntil = pauseResult?.resumesAt || pauseUntil;
  const effectivePauseUsedAt = pauseResult?.usedAt || pauseUsedAt;
  const pauseActive =
    Boolean(effectivePauseUntil) &&
    new Date(effectivePauseUntil).getTime() > Date.now();
  return (
    <>
      <Head>
        <title>Manage Billing | IELTS Bank</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
          <div className="rounded-3xl bg-slate-950 p-7 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Billing choices</p>
            <h1 className="mt-2 text-3xl font-black">Choose what fits your test timeline</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Pause once, switch to a non-renewing Exam Pass after your current period, or continue
              to Stripe to cancel. There is no hidden exit.
            </p>
          </div>

          {pending ? (
            <p className="py-16 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading billing…</p>
          ) : planError ? (
            <div role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center text-sm font-semibold text-amber-900">
              {planError} Billing actions are temporarily disabled.
            </div>
          ) : !user ? (
            <div className="mt-6 rounded-2xl border bg-white p-6 text-center">
              <p className="font-bold">Sign in to manage billing.</p>
              <NextLink href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-emerald-700">Go to dashboard</NextLink>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <section className="rounded-2xl border bg-white p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
                  <div>
                    <h2 className="font-bold">
                      {pauseActive ? 'Premium is paused' : 'Keep Premium active'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {billingStatusMessage({
                        pauseUntil: effectivePauseUntil,
                        expiresAt,
                        planStatus,
                        renewsAt,
                        isPremium,
                      })}
                    </p>
                  </div>
                </div>
              </section>

              {canOfferBillingPause({
                isPremium,
                planStatus,
                renewsAt,
                expiresAt,
                pauseUsedAt: effectivePauseUsedAt,
              }) ? (
                <section className="rounded-2xl border bg-white p-6">
                  <div className="flex items-start gap-3">
                    <PauseCircle className="mt-1 h-5 w-5 text-amber-600" />
                    <div className="flex-1">
                      <h2 className="font-bold">Pause for 30 days</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Billing and Premium access pause now and resume automatically in 30 days.
                        Use this if your exam is over but a retake is still possible.
                      </p>
                      <Button type="button" variant="outline" className="mt-4" disabled={Boolean(busy)} onClick={pausePlan}>
                        {busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                        Pause once
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="rounded-2xl border bg-white p-6">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-1 h-5 w-5 text-blue-600" />
                  <div>
                    <h2 className="font-bold">Prefer no subscription next time?</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      The 4-week Exam Pass is one payment and never renews. Cancel the current plan
                      at period end, then choose the Exam Pass whenever you return.
                    </p>
                    <Button asChild variant="outline" className="mt-4">
                      <NextLink href="/pricing#exam-pass" className="no-underline">See the Exam Pass</NextLink>
                    </Button>
                  </div>
                </div>
              </section>

              {hasBillingAccount ? (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-1 h-5 w-5 text-rose-700" />
                    <div className="flex-1">
                      <h2 className="font-bold text-rose-950">Change payment details or cancel</h2>
                      <p className="mt-1 text-sm text-rose-900/75">
                        Stripe will collect one cancellation reason and schedule cancellation at
                        period end. You keep access through the time you already paid for.
                      </p>
                      <Button type="button" variant="outline" className="mt-4 border-rose-300" disabled={Boolean(busy)} onClick={openPortal}>
                        {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Continue to Stripe
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          )}
          {message ? <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p> : null}
          {error ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p> : null}
        </main>
        <Footer />
      </div>
    </>
  );
}
