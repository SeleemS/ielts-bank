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
//     signInWithEmail(email): Promise<{error}>,  // magic link
//     signInWithGoogle(): Promise<void>,          // OAuth redirect
//     signOut(): Promise<void>,
//   }
//
// All .auth calls go through the single existing anon browser client
// (persistSession true). No second client, no anonymous sign-in — logged-out
// users simply have user=null.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';

const AuthContext = React.createContext(null);

// window.location.origin, safe during SSR / build (returns '' server-side).
function getOrigin() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
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
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setLoading(false);
      });

    // Keep the context live across sign-in / sign-out / token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
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
      options: { emailRedirectTo: `${getOrigin()}/auth/callback` },
    });
    return { error };
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${getOrigin()}/auth/callback` },
    });
  }, []);

  const signOut = React.useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, signInWithEmail, signInWithGoogle, signOut }),
    [user, loading, signInWithEmail, signInWithGoogle, signOut]
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
      signInWithGoogle: async () => {},
      signOut: async () => {},
    };
  }
  return ctx;
}
