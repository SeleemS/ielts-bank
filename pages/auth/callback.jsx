import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getSupabase } from '../../lib/supabase';
import { POST_AUTH_PATH } from '../../src/lib/authPaths';

// Minimal OAuth / magic-link landing page. supabase-js has detectSessionInUrl
// on by default, so simply reading the session here lets it consume the URL
// hash/code and persist the session. Every successful account creation or
// sign-in lands on the dashboard so learners see their progress first. This
// transient credential-processing route must remain excluded from indexing.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!router.isReady) return undefined;
    let active = true;
    let retryTimer;

    function fail() {
      if (!active) return;
      setError(true);
      void router.replace('/');
    }

    async function finish() {
      try {
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
              if (retry.data?.session) {
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
        <title>Completing sign in | IELTS-Bank</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          {error ? 'Could not sign you in. Redirecting…' : 'Signing you in…'}
        </p>
      </main>
    </>
  );
}
