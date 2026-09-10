import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSupabase } from '../../lib/supabase';
import { POST_AUTH_PATH } from '../../src/lib/authPaths';
import SignInDialog from '../../src/components/auth/SignInDialog';

function hasCallbackError(url = '') {
  const parsed = new URL(url, 'https://ielts-bank.com');
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  return ['error', 'error_code', 'error_description'].some(
    (key) => parsed.searchParams.has(key) || fragment.has(key)
  );
}

// Minimal OAuth / magic-link landing page. supabase-js has detectSessionInUrl
// on by default, so simply reading the session here lets it consume the URL
// hash/code and persist the session. Every successful account creation or
// sign-in lands on the dashboard so learners see their progress first. This
// transient credential-processing route must remain excluded from indexing.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  // Capture before the SDK can remove the callback fragment from history.
  const initialUrlError = useRef(
    typeof window !== 'undefined' && hasCallbackError(window.location.href)
  );

  useEffect(() => {
    if (!router.isReady) return undefined;
    let active = true;
    let retryTimer;

    function fail() {
      if (!active) return;
      setError(true);
    }

    async function finish() {
      try {
        // An existing browser session does not make an expired link valid.
        // Never render the provider's raw URL error text to the learner.
        if (initialUrlError.current || hasCallbackError(router.asPath)
          || hasCallbackError(window.location.href)) {
          fail();
          return;
        }
        const supabase = getSupabase();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError || !data?.session) {
          // Give supabase-js a brief moment to process the URL, then retry once.
          retryTimer = setTimeout(async () => {
            try {
              if (!active) return;
              const retry = await supabase.auth.getSession();
              if (!active) return;
              if (!retry.error && retry.data?.session) {
                void router.replace(POST_AUTH_PATH);
              } else {
                fail();
              }
            } catch {
              fail();
            }
          }, 600);
          return;
        }
        void router.replace(POST_AUTH_PATH);
      } catch {
        fail();
      }
    }

    finish();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [router, router.isReady]);

  return (
    <>
      <Head>
        <title>{error ? 'Sign-in link unavailable | IELTS-Bank' : 'Completing sign in | IELTS-Bank'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        {error ? (
          <>
            <div role="alert" className="max-w-md space-y-3">
              <h1 className="text-2xl font-bold">We couldn’t complete this sign-in link</h1>
              <p className="text-sm text-muted-foreground">
                The link may have expired or already been used. Sign in again below.
                If your email still needs confirmation, we’ll help you request a fresh code.
              </p>
              <p className="text-sm text-muted-foreground">
                To reset your password, choose “Forgot password?” after entering your email.
                Use the latest email you receive.
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              onClick={() => setSignInOpen(true)}
            >
              Sign in again
            </button>
            <Link href="/" className="text-sm text-muted-foreground underline">Back to home</Link>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <p role="status" className="text-sm font-medium text-muted-foreground">Signing you in…</p>
          </>
        )}
      </main>
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        initialMode="signin"
        title="Sign in to your account"
        trigger="auth_callback_recovery"
      />
    </>
  );
}
