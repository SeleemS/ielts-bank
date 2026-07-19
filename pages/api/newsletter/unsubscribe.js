export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { validUnsubscribeToken } from '../../../lib/lifecycleEmail';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!email || !validUnsubscribeToken(email, token)) {
    return res.status(400).send('This unsubscribe link is invalid or expired.');
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).send('Unsubscribe is temporarily unavailable.');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await admin
    .from('newsletter_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', email);
  if (error) return res.status(503).send('Unsubscribe is temporarily unavailable.');
  return res.status(200).send('You have been unsubscribed from IELTS Bank weekly emails.');
}
