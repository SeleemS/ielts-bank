// Checkout-return safety net. Stripe webhooks remain authoritative, but this
// authenticated endpoint reconciles a paid session immediately when the user
// returns from Checkout so a delayed webhook cannot strand them on Free.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
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

async function resolveUser(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return { user: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
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

  const { user, error: authError } = await resolveUser(req);
  if (authError) {
    console.error('verify-session auth error:', authError.message);
    return res.status(503).json({ error: 'Activation is still processing.' });
  }
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const sessionId =
    typeof req.body?.session_id === 'string' ? req.body.session_id.trim() : '';
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid checkout session.' });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    const mappedUserId = session.client_reference_id || session.metadata?.user_id;
    if (mappedUserId !== user.id) {
      return res.status(403).json({ error: 'This checkout belongs to another account.' });
    }
    if (session.status !== 'complete' || session.payment_status === 'unpaid') {
      return res.status(409).json({ error: 'Payment is not complete yet.', status: session.status });
    }

    const outcome = await handleStripeEvent(
      {
        id: `verify:${session.id}`,
        type: 'checkout.session.completed',
        data: { object: session },
      },
      { admin: getAdmin(), stripe }
    );
    if (outcome.startsWith('error:')) {
      return res.status(503).json({ error: 'Activation is still processing.' });
    }
    return res.status(200).json({ active: true, outcome });
  } catch (error) {
    console.error('verify-session error:', error.message);
    return res.status(503).json({ error: 'Activation is still processing.' });
  }
}
