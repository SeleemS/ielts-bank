// pages/api/webhooks/stripe.js
// Stripe webhook: verifies the signature over the RAW body, then applies
// idempotent plan/quota upserts via lib/billing.handleStripeEvent.
// Registered events: checkout.session.completed, customer.subscription.*,
// invoice.payment_failed, charge.refunded, charge.dispute.created.
export const config = {
  runtime: 'nodejs',
  api: { bodyParser: false },
};

import { createClient } from '@supabase/supabase-js';
import { getStripe, handleStripeEvent } from '../../../lib/billing';

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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;
  try {
    const raw = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    console.error('stripe webhook signature verification failed:', e.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const outcome = await handleStripeEvent(event, {
      admin: getAdmin(),
      stripe: getStripe(),
    });
    if (outcome.startsWith('error:')) {
      // Signal Stripe to retry: mapping may succeed once data settles.
      console.error('stripe webhook:', event.type, outcome);
      return res.status(500).json({ error: outcome });
    }
    console.log('stripe webhook:', event.type, '->', outcome);
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('stripe webhook handler error:', event.type, e.message);
    return res.status(500).json({ error: 'Handler error' });
  }
}
