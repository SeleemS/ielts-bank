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
//     signInWithEmail(email): Promise<{error}>,          // magic link (fallback)
//     signUpWithPassword(email, password): Promise<{data, error}>,
//     signInWithPassword(email, password): Promise<{error}>,
//     verifyEmailOtp(email, token): Promise<{error}>,          // 6-digit signup code
//     resendSignupEmail(email): Promise<{error}>,
//     signOut(): Promise<void>,
//   }
// Successful account creation and sign-in always land on /dashboard.
//
// All .auth calls go through the single existing anon browser client
// (persistSession true). No second client, no anonymous sign-in — logged-out
// users simply have user=null.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { setAnalyticsUser, track } from './analytics';
import { buildAuthCallbackUrl } from './authPaths';

const AuthContext = React.createContext(null);

// window.location.origin, safe during SSR / build (returns '' server-side).
function getOrigin() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

// Every emailed auth link uses one callback. The callback owns the final
// destination so individual sign-in gates cannot accidentally bypass the
// learner dashboard.
function callbackUrl() {
  return buildAuthCallbackUrl(getOrigin());
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

  const signInWithEmail = React.useCallback(async (email) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    return { error };
  }, []);

  const signUpWithPassword = React.useCallback(async (email, password) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    return { data, error };
  }, []);

  const signInWithPassword = React.useCallback(async (email, password) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  // Verify an emailed 6-digit code. `type` is the expected OTP kind
  // ('signup' for confirmation emails, 'email' for sign-in codes, 'recovery'
  // for password resets). For the signup/email pair the other kind is tried
  // as a fallback since failed attempts are limited per token; recovery codes
  // are only ever recovery codes, so no fallback there.
  const verifyEmailOtp = React.useCallback(async (email, token, type = 'signup') => {
    const supabase = getSupabase();
    const primary = await supabase.auth.verifyOtp({ email, token, type });
    if (!primary.error) return { error: null };
    const altType = type === 'signup' ? 'email' : type === 'email' ? 'signup' : null;
    if (!altType) return { error: primary.error };
    const secondary = await supabase.auth.verifyOtp({ email, token, type: altType });
    return { error: secondary.error ? primary.error : null };
  }, []);

  // Password reset, OTP-style: emails a 6-digit recovery code (the Supabase
  // "Reset Password" template must render {{ .Token }}), verified with
  // verifyEmailOtp(type 'recovery'), after which updatePassword sets the new
  // password on the recovered session.
  const requestPasswordReset = React.useCallback(async (email) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error };
  }, []);

  const updatePassword = React.useCallback(async (password) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  }, []);

  const resendSignupEmail = React.useCallback(async (email) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: callbackUrl() },
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
      requestPasswordReset,
      updatePassword,
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
      requestPasswordReset,
      updatePassword,
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
      requestPasswordReset: async () => ({ error: new Error('AuthProvider missing') }),
      updatePassword: async () => ({ error: new Error('AuthProvider missing') }),
      signOut: async () => {},
    };
  }
  return ctx;
}
