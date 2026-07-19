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
  if (!match) return null;
  const { data, error } = await admin.auth.getUser(match[1].trim());
  return error ? null : data?.user || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const admin = getAdmin();
  const user = await resolveUser(admin, req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  const { data: row, error } = await admin
    .from('users')
    .select('stripe_subscription_id, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, billing_pause_used_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !row?.stripe_subscription_id || !isPremiumRow(row)) {
    return res.status(409).json({ error: 'There is no active subscription to pause.' });
  }
  if (row.billing_pause_used_at) {
    return res.status(409).json({ error: 'The one-time billing pause has already been used.' });
  }

  const resumesAt = Math.floor(Date.now() / 1000) + 30 * 86400;
  try {
    await getStripe().subscriptions.update(row.stripe_subscription_id, {
      pause_collection: { behavior: 'void', resumes_at: resumesAt },
      metadata: { user_id: user.id },
    });
    const resumeIso = new Date(resumesAt * 1000).toISOString();
    const pausedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from('users')
      .update({
        billing_pause_until: resumeIso,
        billing_pause_used_at: pausedAt,
        plan_status: 'active',
      })
      .eq('id', user.id);
    if (updateError) throw updateError;
    await admin.from('activity_events').insert({
      anon_id: `billing:${user.id}`,
      user_id: user.id,
      event: 'subscription_paused',
      props: { resumes_at: resumeIso },
    });
    return res.status(200).json({ paused: true, resumesAt: resumeIso });
  } catch (pauseError) {
    console.error('pause subscription error:', pauseError.message);
    return res.status(503).json({ error: 'Could not pause the subscription. Please try again.' });
  }
}
