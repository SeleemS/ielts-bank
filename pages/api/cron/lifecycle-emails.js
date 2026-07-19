export const config = { runtime: 'nodejs', maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';
import { posts } from '../../../lib/posts';
import { sendLifecycleEmail } from '../../../lib/lifecycleEmail';
import { isPremiumRow } from '../../../lib/premium';

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function queueWeeklyDigest(admin, force = false) {
  const now = new Date();
  if (!force && now.getUTCDay() !== 1) return 0;
  const { data: subscribers, error } = await admin
    .from('newsletter_subscribers')
    .select('email')
    .eq('confirmed', true)
    .is('unsubscribed_at', null)
    .limit(50000);
  if (error) throw error;
  if (!subscribers?.length) return 0;

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, email, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
    .not('email', 'is', null)
    .limit(50000);
  if (usersError) throw usersError;
  const usersByEmail = new Map((users || []).map((user) => [user.email?.toLowerCase(), user]));
  const latest = posts[0];
  const key = weekKey(now);
  const rows = subscribers.map(({ email }) => {
    const user = usersByEmail.get(email.toLowerCase());
    const premium = isPremiumRow(user, now.getTime());
    return {
      user_id: user?.id || null,
      recipient_email: email.toLowerCase(),
      email_type: 'weekly_digest',
      idempotency_key: `weekly_digest:${key}:${email.toLowerCase()}`,
      payload: {
        plan: premium ? 'premium' : 'free',
        subject: `This week: ${latest?.title || 'your IELTS practice plan'}`,
        title: latest?.title || 'Your weekly IELTS practice plan',
        intro: latest?.excerpt || 'Practise one weak skill under a real time limit this week.',
        cta_label: latest ? 'Read the guide' : 'Open my dashboard',
        cta_href: latest
          ? `https://www.ielts-bank.com/blog/${latest.slug}`
          : 'https://www.ielts-bank.com/dashboard',
      },
    };
  });
  const { error: insertError } = await admin
    .from('lifecycle_emails')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (insertError) throw insertError;
  return rows.length;
}

async function queueWinBack(admin) {
  if (!process.env.STRIPE_WINBACK_COUPON_ID) return 0;
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: users, error } = await admin
    .from('users')
    .select('id, email, canceled_at')
    .eq('plan', 'free')
    .not('email', 'is', null)
    .lte('canceled_at', cutoff)
    .limit(5000);
  if (error) throw error;
  const rows = (users || []).map((user) => ({
    user_id: user.id,
    recipient_email: user.email.toLowerCase(),
    email_type: 'win_back',
    idempotency_key: `win_back:${user.id}:${String(user.canceled_at).slice(0, 10)}`,
    payload: { canceled_at: user.canceled_at },
  }));
  if (!rows.length) return 0;
  const { error: insertError } = await admin
    .from('lifecycle_emails')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (insertError) throw insertError;
  return rows.length;
}

const MARKETING_EMAIL_TYPES = new Set(['weekly_digest', 'win_back']);
const STALE_CLAIM_MINUTES = 15;

export async function recipientAllowsMarketing(admin, email) {
  const { data, error } = await admin
    .from('newsletter_subscribers')
    .select('email')
    .eq('email', String(email || '').trim().toLowerCase())
    .eq('confirmed', true)
    .is('unsubscribed_at', null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function reclaimStaleDeliveries(admin, now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from('lifecycle_emails')
    .update({
      status: 'failed',
      last_error: 'delivery-claim-expired',
      updated_at: now.toISOString(),
    })
    .eq('status', 'sending')
    .is('sent_at', null)
    .lt('updated_at', cutoff)
    .lt('attempts', 5)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

export async function deliverDue(admin, { send = sendLifecycleEmail, now = new Date() } = {}) {
  const reclaimed = await reclaimStaleDeliveries(admin, now);
  const { data: due, error } = await admin
    .from('lifecycle_emails')
    .select('*')
    .in('status', ['pending', 'failed'])
    .is('sent_at', null)
    .lte('scheduled_for', now.toISOString())
    .lt('attempts', 5)
    .order('scheduled_for')
    .limit(50);
  if (error) throw error;

  const results = { sent: 0, failed: 0, suppressed: 0, skipped: 0, reclaimed };
  for (const row of due || []) {
    if (
      MARKETING_EMAIL_TYPES.has(row.email_type) &&
      !(await recipientAllowsMarketing(admin, row.recipient_email))
    ) {
      const { data: suppressed, error: suppressError } = await admin
        .from('lifecycle_emails')
        .update({
          status: 'suppressed',
          last_error: 'recipient-not-subscribed',
          updated_at: now.toISOString(),
        })
        .eq('id', row.id)
        .in('status', ['pending', 'failed'])
        .select('id')
        .maybeSingle();
      if (suppressError) throw suppressError;
      if (suppressed) results.suppressed += 1;
      else results.skipped += 1;
      continue;
    }

    const { data: claimed, error: claimError } = await admin
      .from('lifecycle_emails')
      .update({ status: 'sending', attempts: row.attempts + 1, updated_at: now.toISOString() })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      results.skipped += 1;
      continue;
    }
    const sent = await send(row);
    if (sent.sent) {
      const { error: sentUpdateError } = await admin
        .from('lifecycle_emails')
        .update({
          status: 'sent',
          sent_at: now.toISOString(),
          provider_id: sent.providerId,
          last_error: null,
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      if (sentUpdateError) throw sentUpdateError;
      results.sent += 1;
    } else {
      const { error: failedUpdateError } = await admin
        .from('lifecycle_emails')
        .update({
          status: 'failed',
          last_error: sent.reason,
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      if (failedUpdateError) throw failedUpdateError;
      results.failed += 1;
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();
  try {
    const admin = getAdmin();
    const [weeklyQueued, winBackQueued] = await Promise.all([
      queueWeeklyDigest(admin, req.query.weekly === '1'),
      queueWinBack(admin),
    ]);
    const delivery = await deliverDue(admin);
    return res.status(200).json({ weeklyQueued, winBackQueued, ...delivery });
  } catch (error) {
    console.error('lifecycle email cron failed:', error.message);
    return res.status(500).json({ error: 'Lifecycle email run failed.' });
  }
}
