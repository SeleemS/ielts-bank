// src/lib/usePlan.js
// Reads the signed-in user's billing state from their own `users` row (RLS:
// owner-select). Client-side display only — every real gate is enforced
// server-side (scoring RPC, checkout, webhook). Never trust isPremium here
// for anything but UI.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from './auth';

export function isPremiumActive(plan, planStatus, renewsAt, expiresAt = null, pauseUntil = null) {
  if (pauseUntil && new Date(pauseUntil).getTime() > Date.now()) return false;
  if (expiresAt && new Date(expiresAt).getTime() > Date.now()) return true;
  if (plan !== 'premium') return false;
  if (['active', 'trialing', 'past_due'].includes(planStatus)) return true;
  if (planStatus === 'canceled') {
    return renewsAt ? new Date(renewsAt).getTime() > Date.now() : false;
  }
  return false;
}

export function usePlan() {
  const { user } = useAuth();
  const [state, setState] = React.useState({
    loading: true,
    plan: 'free',
    planStatus: 'inactive',
    renewsAt: null,
    expiresAt: null,
    pauseUntil: null,
    hasBillingAccount: false,
  });

  React.useEffect(() => {
    if (!user?.id) {
      setState({ loading: false, plan: 'free', planStatus: 'inactive', renewsAt: null, expiresAt: null, pauseUntil: null, hasBillingAccount: false });
      return undefined;
    }
    let active = true;
    getSupabase()
      .from('users')
      .select('plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setState({
          loading: false,
          plan: data?.plan || 'free',
          planStatus: data?.plan_status || 'inactive',
          renewsAt: data?.plan_renews_at || null,
          expiresAt: data?.plan_expires_at || null,
          pauseUntil: data?.billing_pause_until || null,
          hasBillingAccount: Boolean(data?.stripe_customer_id),
        });
      })
      .catch(() => {
        if (active) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  return {
    ...state,
    isPremium: isPremiumActive(
      state.plan,
      state.planStatus,
      state.renewsAt,
      state.expiresAt,
      state.pauseUntil
    ),
  };
}
