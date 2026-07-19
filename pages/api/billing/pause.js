export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { getStripe } from '../../../lib/billing';
import { isPremiumRow } from '../../../lib/premium';

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
      .select('stripe_subscription_id, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, billing_pause_used_at')
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
    await getStripe().subscriptions.update(row.stripe_subscription_id, {
      pause_collection: { behavior: 'void', resumes_at: resumesAt },
      metadata: { user_id: user.id },
    });
  } catch (stripeError) {
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

  let updateError;
  try {
    const result = await admin
      .from('users')
      .update({
        billing_pause_until: resumeIso,
        plan_status: 'active',
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
