export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import {
  getStripe,
  mapSubscriptionToPlanFields,
  resumeStripeSubscription,
  STRIPE_PAUSE_RESUMES_AT_METADATA,
} from '../../../lib/billing';

const RESUME_BATCH_SIZE = 100;

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function persistSubscription(admin, userId, subscription) {
  const fields = mapSubscriptionToPlanFields(subscription);
  const { error } = await admin.from('users').update(fields).eq('id', userId);
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).end();
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (error) {
    console.error('billing resume client failed:', error.message);
    return res.status(503).json({ error: 'Billing resume is not configured.' });
  }

  let due;
  try {
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('users')
      .select('id, stripe_subscription_id, billing_pause_until')
      .eq('plan', 'premium')
      .eq('plan_status', 'paused')
      .lte('billing_pause_until', now)
      .not('stripe_subscription_id', 'is', null)
      .order('billing_pause_until', { ascending: true })
      .limit(RESUME_BATCH_SIZE);
    if (error) throw error;
    due = data || [];
  } catch (error) {
    console.error('billing resume lookup failed:', error.message);
    return res.status(503).json({ error: 'Could not find subscriptions due to resume.' });
  }

  if (due.length === 0) {
    return res.status(200).json({ ok: true, due: 0, resumed: 0, reconciled: 0, pending: 0, failed: 0 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (error) {
    console.error('billing resume Stripe client failed:', error.message);
    return res.status(503).json({ error: 'Billing resume is not configured.' });
  }
  let resumed = 0;
  let reconciled = 0;
  let pending = 0;
  let failed = 0;

  for (const row of due) {
    try {
      let subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if (subscription.status === 'paused') {
        subscription = await resumeStripeSubscription(stripe, row.stripe_subscription_id);
      }

      if (['active', 'trialing'].includes(subscription.status)) {
        try {
          subscription = await stripe.subscriptions.update(row.stripe_subscription_id, {
            metadata: { [STRIPE_PAUSE_RESUMES_AT_METADATA]: '' },
          });
        } catch (metadataError) {
          console.error('billing resume metadata cleanup failed:', metadataError.message);
        }
        await persistSubscription(admin, row.id, subscription);
        resumed += 1;
        try {
          const { error: eventError } = await admin.from('activity_events').insert({
            anon_id: `billing:${row.id}`,
            user_id: row.id,
            event: 'subscription_resumed',
            props: { scheduled_resume_at: row.billing_pause_until },
          });
          if (eventError) console.error('billing resume activity event failed:', eventError.message);
        } catch (eventError) {
          console.error('billing resume activity event failed:', eventError.message);
        }
      } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)) {
        await persistSubscription(admin, row.id, subscription);
        reconciled += 1;
      } else if (subscription.status === 'paused') {
        // With resume_on_payment_success, a failed payment deliberately leaves
        // the subscription paused. Retain the row for the next scheduled retry.
        pending += 1;
      } else {
        throw new Error(`unexpected subscription status ${subscription.status}`);
      }
    } catch (error) {
      failed += 1;
      console.error('billing resume failed:', error.message);
    }
  }

  const body = {
    ok: failed === 0,
    due: due.length,
    resumed,
    reconciled,
    pending,
    failed,
  };
  return res.status(failed === 0 ? 200 : 503).json(body);
}
