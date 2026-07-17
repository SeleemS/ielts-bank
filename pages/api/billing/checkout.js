// pages/api/billing/checkout.js
// Creates a Stripe Checkout Session for a premium subscription.
//   * signed-in, NON-anonymous users only (receipts + portal need an email);
//   * price resolved server-side by lookup_key — PPP variant when the request
//     geo (x-vercel-ip-country) is in the PPP list. Never client-chosen.
//   * promotion codes allowed; card collection skipped for 100%-off checkouts.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { getStripe, resolveLookupKey, isPppCountry, SKUS } from '../../../lib/billing';

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

async function resolveUser(req) {
  const authz = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return null;
  const { data, error } = await getAdmin().auth.getUser(match[1].trim());
  if (error || !data?.user) return null;
  return data.user;
}

function siteOrigin(req) {
  if (process.env.NODE_ENV !== 'production') {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.startsWith('http://localhost')) return origin;
  }
  return 'https://ielts-bank.com';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const authUser = await resolveUser(req);
  if (!authUser) return res.status(401).json({ error: 'Sign in to upgrade.' });

  const sku = typeof req.body?.sku === 'string' ? req.body.sku : 'monthly';
  if (!SKUS.includes(sku)) return res.status(400).json({ error: 'Unknown plan.' });

  const admin = getAdmin();
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email, is_anonymous, plan, stripe_customer_id')
    .eq('id', authUser.id)
    .single();
  if (userErr || !userRow) return res.status(401).json({ error: 'Account not found.' });
  if (userRow.is_anonymous || !userRow.email) {
    return res.status(403).json({
      error: 'Link an email or Google account before upgrading.',
      code: 'anonymous_user',
    });
  }
  if (userRow.plan === 'premium') {
    return res.status(409).json({ error: 'You already have Premium.', code: 'already_premium' });
  }

  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const lookupKey = resolveLookupKey(sku, country);

  try {
    const stripe = getStripe();

    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    const price = prices.data[0];
    if (!price) {
      console.error('checkout: missing price for lookup key', lookupKey);
      return res.status(500).json({ error: 'Pricing unavailable. Please try again later.' });
    }

    let customerId = userRow.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRow.email,
        metadata: { user_id: userRow.id },
      });
      customerId = customer.id;
      const { error: saveErr } = await admin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userRow.id);
      if (saveErr) console.error('checkout: failed to save customer id:', saveErr.message);
    }

    const origin = siteOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: true,
      payment_method_collection: 'if_required',
      client_reference_id: userRow.id,
      subscription_data: {
        metadata: { user_id: userRow.id, ppp: isPppCountry(country) ? '1' : '0' },
      },
      ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('checkout error:', e.message, 'ip:', clientIp(req));
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}
