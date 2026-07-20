// src/lib/usePlan.js
// Reads the signed-in user's billing state from their own `users` row (RLS:
// owner-select). Client-side display only — every real gate is enforced
// server-side (scoring RPC, checkout, webhook). Never trust isPremium here
// for anything but UI.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { isPremiumRow } from '../../lib/premium';
import { useAuth } from './auth';

export function isPremiumActive(plan, planStatus, renewsAt, expiresAt = null, pauseUntil = null) {
  return isPremiumRow({
    plan,
    plan_status: planStatus,
    plan_renews_at: renewsAt,
    plan_expires_at: expiresAt,
    billing_pause_until: pauseUntil,
  });
}

export function usePlan() {
  const { user } = useAuth();
  const [state, setState] = React.useState({
    loading: true,
    plan: 'free',
    planSku: null,
    planStatus: 'inactive',
    renewsAt: null,
    expiresAt: null,
    pauseUntil: null,
    pauseUsedAt: null,
    hasBillingAccount: false,
    error: null,
  });

  React.useEffect(() => {
    if (!user?.id) {
      setState({ loading: false, plan: 'free', planSku: null, planStatus: 'inactive', renewsAt: null, expiresAt: null, pauseUntil: null, pauseUsedAt: null, hasBillingAccount: false, error: null });
      return undefined;
    }
    let active = true;
    getSupabase()
      .from('users')
      .select('plan, plan_sku, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, billing_pause_used_at, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Could not verify your current plan. Please refresh and try again.',
          }));
          return;
        }
        setState({
          loading: false,
          plan: data?.plan || 'free',
          planSku: data?.plan_sku || null,
          planStatus: data?.plan_status || 'inactive',
          renewsAt: data?.plan_renews_at || null,
          expiresAt: data?.plan_expires_at || null,
          pauseUntil: data?.billing_pause_until || null,
          pauseUsedAt: data?.billing_pause_used_at || null,
          hasBillingAccount: Boolean(data?.stripe_customer_id),
          error: null,
        });
      })
      .catch(() => {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Could not verify your current plan. Please refresh and try again.',
          }));
        }
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
