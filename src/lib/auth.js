// src/lib/auth.js
// Shared auth foundation for ielts-bank.com. Provides a React context around
// the existing Supabase browser client (lib/supabase.js getSupabase). Other
// features (progress-persistence, dashboard) build against this exact contract.
//
// Contract:
//   <AuthProvider>  — wrap the app once.
//   useAuth() -> {
//     user,                              // Supabase user object or null (user.id, user.email)
//     loading,                           // true until the initial session resolves
//     signInWithEmail(email, next): Promise<{error}>,          // magic link (fallback)
//     signUpWithPassword(email, password, next): Promise<{data, error}>,
//     signInWithPassword(email, password): Promise<{error}>,
//     verifyEmailOtp(email, token): Promise<{error}>,          // 6-digit signup code
//     resendSignupEmail(email, next): Promise<{error}>,
//     signOut(): Promise<void>,
//   }
//   `next` is a same-origin path ('/writingquestion/foo') the emailed link
//   should return the user to, via /auth/callback?next=…
//
// All .auth calls go through the single existing anon browser client
// (persistSession true). No second client, no anonymous sign-in — logged-out
// users simply have user=null.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { setAnalyticsUser, track } from './analytics';

const AuthContext = React.createContext(null);

// window.location.origin, safe during SSR / build (returns '' server-side).
function getOrigin() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

// Build the emailed-link landing URL. `next` must be a same-origin path
// ('/writingquestion/foo'); anything else is dropped so the email can never
// redirect off-site.
function callbackUrl(next) {
  const base = `${getOrigin()}/auth/callback`;
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return `${base}?next=${encodeURIComponent(next)}`;
  }
  return base;
}

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let subscription;

    // getSupabase throws if the public env vars are absent. Guard so the app
    // still renders (logged-out) rather than crashing.
    let supabase;
    try {
      supabase = getSupabase();
    } catch (err) {
      if (active) {
        setUser(null);
        setLoading(false);
      }
      return () => {
        active = false;
      };
    }

    // Resolve the initial session on mount.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setUser(data?.session?.user ?? null);
        setAnalyticsUser(data?.session?.user?.id || null, data?.session?.access_token || null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setLoading(false);
      });

    // Keep the context live across sign-in / sign-out / token refresh.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAnalyticsUser(session?.user?.id || null, session?.access_token || null);
      if (event === 'SIGNED_IN') {
        track('login', { method: 'email', signed_in: true }, { accessToken: session?.access_token });
      }
      setLoading(false);
    });
    subscription = data?.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  const signInWithEmail = React.useCallback(async (email, next) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    return { error };
  }, []);

  const signUpWithPassword = React.useCallback(async (email, password, next) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    return { data, error };
  }, []);

  const signInWithPassword = React.useCallback(async (email, password) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  // Verify the 6-digit code from the signup confirmation email. Falls back to
  // type 'email' so codes from magic-link/OTP emails also work.
  const verifyEmailOtp = React.useCallback(async (email, token) => {
    const supabase = getSupabase();
    const first = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (!first.error) return { error: null };
    const second = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    return { error: second.error ? first.error : null };
  }, []);

  const resendSignupEmail = React.useCallback(async (email, next) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    return { error };
  }, []);

  const signOut = React.useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      loading,
      signInWithEmail,
      signUpWithPassword,
      signInWithPassword,
      verifyEmailOtp,
      resendSignupEmail,
      signOut,
    }),
    [
      user,
      loading,
      signInWithEmail,
      signUpWithPassword,
      signInWithPassword,
      verifyEmailOtp,
      resendSignupEmail,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    // Defensive default so components that render outside the provider (or
    // during odd SSR edge cases) don't throw.
    return {
      user: null,
      loading: true,
      signInWithEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signUpWithPassword: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithPassword: async () => ({ error: new Error('AuthProvider missing') }),
      verifyEmailOtp: async () => ({ error: new Error('AuthProvider missing') }),
      resendSignupEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signOut: async () => {},
    };
  }
  return ctx;
}
