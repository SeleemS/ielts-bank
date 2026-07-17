// pages/api/billing/portal.js
// Creates a Stripe Customer Portal session (cancel / change plan / invoices).
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { getStripe } from '../../../lib/billing';

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const authz = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return res.status(401).json({ error: 'Sign in first.' });
  const { data, error } = await getAdmin().auth.getUser(match[1].trim());
  if (error || !data?.user) return res.status(401).json({ error: 'Sign in first.' });

  const { data: userRow } = await getAdmin()
    .from('users')
    .select('stripe_customer_id')
    .eq('id', data.user.id)
    .single();
  if (!userRow?.stripe_customer_id) {
    return res.status(404).json({ error: 'No billing account yet.' });
  }

  try {
    const origin =
      process.env.NODE_ENV !== 'production' &&
      typeof req.headers.origin === 'string' &&
      req.headers.origin.startsWith('http://localhost')
        ? req.headers.origin
        : 'https://www.ielts-bank.com';
    const session = await getStripe().billingPortal.sessions.create({
      customer: userRow.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('portal error:', e.message);
    return res.status(500).json({ error: 'Could not open the billing portal.' });
  }
}
