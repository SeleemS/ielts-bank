import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../../lib/supabase';

// Minimal OAuth / magic-link landing page. supabase-js has detectSessionInUrl
// on by default, so simply reading the session here lets it consume the URL
// hash/code and persist the session. Then we return the user to where they
// were (?next=/some/path) or the dashboard.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!router.isReady) return undefined;
    let active = true;

    // Only same-origin paths — the emailed link must never redirect off-site.
    const rawNext = typeof router.query.next === 'string' ? router.query.next : '';
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

    async function finish() {
      try {
        const supabase = getSupabase();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError || !data?.session) {
          // Give supabase-js a brief moment to process the URL, then retry once.
          setTimeout(async () => {
            if (!active) return;
            const retry = await supabase.auth.getSession();
            if (!active) return;
            if (retry.data?.session) {
              router.replace(next);
            } else {
              setError(true);
              router.replace('/');
            }
          }, 600);
          return;
        }
        router.replace(next);
      } catch (err) {
        if (!active) return;
        setError(true);
        router.replace('/');
      }
    }

    finish();
    return () => {
      active = false;
    };
  }, [router, router.isReady]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      <p className="text-sm font-medium text-muted-foreground">
        {error ? 'Could not sign you in. Redirecting…' : 'Signing you in…'}
      </p>
    </main>
  );
}
