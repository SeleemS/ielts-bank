import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { Loader2 } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import SignInDialog from '../../src/components/auth/SignInDialog';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../src/lib/auth';
import { getSupabase } from '../../lib/supabase';
import { gaClientId, gaSessionId, track } from '../../src/lib/analytics';
import { getSessionAccess } from '../../src/lib/sessionAccess';

// /billing/resume?c=<token> — where the checkout recovery email lands.
// It never talks to Stripe directly: once the learner is signed in as the
// account the email was sent to, POST /api/billing/resume re-runs the checkout
// guards and either opens a brand-new Checkout Session for the same plan or
// sends the learner to /pricing or /dashboard with a friendly notice.

const TOKEN_KEY = 'ielts-checkout-resume';
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function storeToken(token) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage denied: the in-memory token still covers an in-page sign-in.
  }
}

export default function ResumeCheckoutPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [token, setToken] = React.useState('');
  const [phase, setPhase] = React.useState('loading'); // loading | sign_in | wrong_user | error
  const [message, setMessage] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const attemptedFor = React.useRef('');
  const signInTracked = React.useRef(false);

  // Take the token out of the address bar straight away so it never lands in
  // page-view analytics or a shared screenshot; keep it for this tab only.
  React.useEffect(() => {
    if (!router.isReady) return;
    const fromUrl = typeof router.query.c === 'string' ? router.query.c : '';
    // A refresh mid-sign-in has no ?c= any more; fall back to this tab's copy.
    const next = fromUrl || readStoredToken();
    if (fromUrl) {
      storeToken(TOKEN_RE.test(fromUrl) ? fromUrl : '');
      void router.replace('/billing/resume', undefined, { shallow: true });
    }
    if (!TOKEN_RE.test(next)) {
      track('checkout_resume', { outcome: 'not_found' });
      void router.replace('/pricing?resume=unavailable');
      return;
    }
    setToken(next);
    // Only the first ready pass matters; the shallow replace re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const resume = React.useCallback(async () => {
    setPhase('loading');
    setMessage('');
    try {
      const { accessToken, error } = await getSessionAccess(getSupabase);
      if (error) throw new Error('session');
      if (!accessToken) {
        setPhase('sign_in');
        setSignInOpen(true);
        return;
      }
      const response = await fetch('/api/billing/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ c: token, ga_sid: await gaSessionId(), ga_cid: gaClientId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.url === 'string') {
        track('checkout_resume', { outcome: 'new_session' });
        storeToken('');
        window.location.assign(body.url);
        return;
      }
      track('checkout_resume', { outcome: body.outcome || 'error', http_status: response.status });
      if (body.outcome === 'sign_in_required' || body.outcome === 'anonymous_user') {
        setPhase('sign_in');
        setMessage(body.error || '');
        setSignInOpen(true);
        return;
      }
      if (body.outcome === 'wrong_user') {
        setPhase('wrong_user');
        setMessage(body.error || '');
        return;
      }
      if (typeof body.redirect === 'string' && body.redirect.startsWith('/')) {
        storeToken('');
        void router.replace(body.redirect);
        return;
      }
      setPhase('error');
      setMessage(body.error || 'We couldn’t reopen your checkout. No charge was made.');
    } catch {
      setPhase('error');
      setMessage('We couldn’t reopen your checkout. Check your connection and try again — no charge was made.');
    }
  }, [router, token]);

  React.useEffect(() => {
    if (!token || loading) return;
    if (!user?.id || user.is_anonymous) {
      setPhase('sign_in');
      setSignInOpen(true);
      if (!signInTracked.current) {
        signInTracked.current = true;
        track('checkout_resume', { outcome: 'sign_in_required' });
      }
      return;
    }
    if (attemptedFor.current === user.id) return;
    attemptedFor.current = user.id;
    void resume();
  }, [token, loading, user?.id, user?.is_anonymous, resume]);

  async function switchAccount() {
    await signOut();
    attemptedFor.current = '';
    setMessage('');
    setPhase('sign_in');
    setSignInOpen(true);
  }

  return (
    <>
      <Head>
        <title>Finish your checkout | IELTS Bank</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Navbar />
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
          <div className="rounded-2xl border bg-white p-7 text-center shadow-sm">
            <h1 className="text-2xl font-black text-slate-950">Finish your checkout</h1>
            {phase === 'loading' ? (
              <p role="status" className="mt-4 text-sm text-slate-600">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Checking your account and reopening checkout…
              </p>
            ) : null}
            {phase === 'sign_in' ? (
              <>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {message || 'Sign in with the account you used at checkout. We’ll check your plan first, so you can never be charged twice.'}
                </p>
                <Button className="mt-5" onClick={() => setSignInOpen(true)}>Sign in to continue</Button>
              </>
            ) : null}
            {phase === 'wrong_user' ? (
              <>
                <p role="alert" className="mt-4 text-sm leading-6 text-slate-700">{message}</p>
                <Button className="mt-5" onClick={switchAccount}>Sign out and switch account</Button>
              </>
            ) : null}
            {phase === 'error' ? (
              <>
                <p role="alert" className="mt-4 text-sm leading-6 text-slate-700">{message}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Button onClick={() => { attemptedFor.current = user?.id || ''; void resume(); }}>Try again</Button>
                  <NextLink href="/pricing" className="inline-flex items-center text-sm font-semibold text-emerald-700">See plans</NextLink>
                </div>
              </>
            ) : null}
            <p className="mt-6 text-xs leading-5 text-slate-500">
              Every plan has a 14-day money-back guarantee. Payment happens on Stripe’s secure checkout.
            </p>
          </div>
        </main>
        <Footer />
      </div>
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        initialMode="signin"
        title="Sign in to finish your checkout"
        description="Use the account you started checkout with. You’ll stay right on this page."
        trigger="checkout_resume"
        redirectOnFinish={false}
      />
    </>
  );
}
