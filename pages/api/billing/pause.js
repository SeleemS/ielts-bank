export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import {
  getStripe,
  pauseStripeSubscription,
  STRIPE_PAUSE_RESUMES_AT_METADATA,
} from '../../../lib/billing';
import { isPremiumRow } from '../../../lib/premium';

const PAUSE_WINDOW_SECONDS = 10 * 60;
const PAUSE_MAX_PER_WINDOW = 5;

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveUser(admin, req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return { user: null, error: null };
  try {
    const { data, error } = await admin.auth.getUser(match[1].trim());
    return {
      user: error ? null : data?.user || null,
      error: null,
    };
  } catch (error) {
    return { user: null, error };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const admin = getAdmin();
  const { user, error: authError } = await resolveUser(admin, req);
  if (authError) {
    console.error('pause auth lookup error:', authError.message);
    return res.status(503).json({
      error: 'Could not verify your subscription. Please try again.',
    });
  }
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  let row;
  try {
    const { data, error } = await admin
      .from('users')
      .select('stripe_customer_id, stripe_subscription_id, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, billing_pause_used_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    row = data;
  } catch (error) {
    console.error('pause subscription lookup error:', error.message);
    return res.status(503).json({
      error: 'Could not verify your subscription. Please try again.',
    });
  }
  if (
    !row?.stripe_subscription_id
    || row.plan_status === 'canceled'
    || !isPremiumRow(row)
  ) {
    return res.status(409).json({ error: 'There is no active subscription to pause.' });
  }
  if (row.billing_pause_used_at) {
    return res.status(409).json({ error: 'The one-time billing pause has already been used.' });
  }

  try {
    const { data: allowed, error } = await admin.rpc('check_rate_limit', {
      p_bucket: 'billing-pause',
      p_identifier: user.id,
      p_window_seconds: PAUSE_WINDOW_SECONDS,
      p_max: PAUSE_MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many billing pause attempts. Please wait a few minutes and try again.',
      });
    }
  } catch (error) {
    console.error('pause rate-limit error:', error.message);
    return res.status(503).json({
      error: 'Could not pause the subscription. Please try again.',
    });
  }

  let stripe;
  let subscription;
  try {
    stripe = getStripe();
    subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  } catch (error) {
    console.error('pause Stripe subscription lookup error:', error.message);
    return res.status(503).json({
      error: 'Could not verify your Stripe subscription. Please try again.',
    });
  }
  const subscriptionCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
  const hasBillingSchedules = Array.isArray(subscription.billing_schedules)
    ? subscription.billing_schedules.length > 0
    : Boolean(subscription.billing_schedules);
  if (
    subscription.id !== row.stripe_subscription_id
    || (row.stripe_customer_id && subscriptionCustomerId !== row.stripe_customer_id)
    || (subscription.metadata?.user_id && subscription.metadata.user_id !== user.id)
    || subscription.status !== 'active'
    || subscription.billing_mode?.type !== 'flexible'
    || subscription.collection_method !== 'charge_automatically'
    || Boolean(subscription.pause_collection)
    || Boolean(subscription.schedule)
    || hasBillingSchedules
  ) {
    return res.status(409).json({
      error: 'This subscription cannot be paused automatically. Continue to Stripe for billing options.',
    });
  }

  const resumesAt = Math.floor(Date.now() / 1000) + 30 * 86400;
  const resumeIso = new Date(resumesAt * 1000).toISOString();
  const pausedAt = new Date().toISOString();

  // Atomically reserve the one-time action before touching Stripe. Two
  // concurrent requests may both read the old row above, but only one can
  // change billing_pause_used_at from null.
  let claim;
  let claimError;
  try {
    const result = await admin
      .from('users')
      .update({ billing_pause_used_at: pausedAt })
      .eq('id', user.id)
      .is('billing_pause_used_at', null)
      .select('id')
      .maybeSingle();
    claim = result.data;
    claimError = result.error;
  } catch (error) {
    claimError = error;
  }
  if (claimError) {
    console.error('pause claim error:', claimError.message);
    return res.status(503).json({ error: 'Could not pause the subscription. Please try again.' });
  }
  if (!claim) {
    return res.status(409).json({ error: 'The one-time billing pause has already been used.' });
  }

  try {
    await stripe.subscriptions.update(row.stripe_subscription_id, {
      metadata: {
        user_id: user.id,
        [STRIPE_PAUSE_RESUMES_AT_METADATA]: String(resumesAt),
      },
    });
    const pausedSubscription = await pauseStripeSubscription(
      stripe,
      row.stripe_subscription_id
    );
    if (pausedSubscription?.status !== 'paused') {
      throw new Error('Stripe did not return a paused subscription');
    }
  } catch (stripeError) {
    // A lost response can arrive after Stripe committed the pause. Read back
    // before releasing the one-time reservation so a retry can never pause the
    // same billing commitment twice.
    let confirmedPaused = false;
    try {
      const readback = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      confirmedPaused =
        readback?.status === 'paused'
        && readback?.metadata?.[STRIPE_PAUSE_RESUMES_AT_METADATA] === String(resumesAt);
    } catch (readbackError) {
      console.error('pause Stripe readback error:', readbackError.message);
    }
    if (confirmedPaused) {
      console.warn('pause Stripe response was lost; readback confirmed the pause');
    } else {
      try {
        await stripe.subscriptions.update(row.stripe_subscription_id, {
          metadata: { [STRIPE_PAUSE_RESUMES_AT_METADATA]: '' },
        });
      } catch (metadataError) {
        console.error('pause metadata rollback error:', metadataError.message);
      }

      // Stripe did not change, so release this exact reservation for a safe
      // retry. The timestamp guard prevents one request from undoing another.
      let rollbackError;
      try {
        const result = await admin
          .from('users')
          .update({ billing_pause_used_at: null })
          .eq('id', user.id)
          .eq('billing_pause_used_at', pausedAt)
          .select('id')
          .maybeSingle();
        rollbackError = result.error;
      } catch (error) {
        rollbackError = error;
      }
      if (rollbackError) console.error('pause claim rollback error:', rollbackError.message);
      console.error('pause subscription error:', stripeError.message);
      if (rollbackError) {
        return res.status(503).json({
          error: 'The subscription was not paused, but the one-time action could not be reset. Please contact support.',
        });
      }
      return res.status(503).json({ error: 'Could not pause the subscription. Please try again.' });
    }
  }

  let updateError;
  try {
    const result = await admin
      .from('users')
      .update({
        billing_pause_until: resumeIso,
        plan_status: 'paused',
      })
      .eq('id', user.id)
      .select('id')
      .maybeSingle();
    updateError = result.error;
  } catch (error) {
    updateError = error;
  }
  if (updateError) {
    // Stripe is authoritative and will emit customer.subscription.updated,
    // whose mapper restores billing_pause_until. Keep the one-time claim and
    // report the real external outcome instead of inviting a duplicate retry.
    console.error('pause detail persistence pending:', updateError.message);
  }
  try {
    const { error: eventError } = await admin.from('activity_events').insert({
      anon_id: `billing:${user.id}`,
      user_id: user.id,
      event: 'subscription_paused',
      props: { resumes_at: resumeIso },
    });
    if (eventError) console.error('pause activity event error:', eventError.message);
  } catch (eventError) {
    console.error('pause activity event error:', eventError.message);
  }
  return res.status(200).json({
    paused: true,
    resumesAt: resumeIso,
    reconciling: Boolean(updateError),
  });
}
