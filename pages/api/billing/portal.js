// pages/api/billing/portal.js
// Creates a Stripe Customer Portal session (cancel / change plan / invoices).
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { getStripe } from '../../../lib/billing';

const PORTAL_WINDOW_SECONDS = 10 * 60;
const PORTAL_MAX_PER_WINDOW = 10;

let _admin = null;
let _portalConfigurationId = null;
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

async function portalConfiguration(stripe) {
  if (process.env.STRIPE_PORTAL_CONFIGURATION_ID) {
    return process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  }
  if (_portalConfigurationId) return _portalConfigurationId;
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const managed = existing.data.find(
    (configuration) => configuration.metadata?.ielts_bank_managed === '1'
  );
  if (managed) {
    _portalConfigurationId = managed.id;
    return managed.id;
  }
  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: 'Manage your IELTS Bank Premium plan',
      privacy_policy_url: 'https://www.ielts-bank.com/privacypolicy',
      terms_of_service_url: 'https://www.ielts-bank.com/termsofservice',
    },
    default_return_url: 'https://www.ielts-bank.com/billing/manage',
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: [
            'too_expensive',
            'missing_features',
            'switched_service',
            'unused',
            'low_quality',
            'other',
          ],
        },
      },
      subscription_update: { enabled: false },
    },
    metadata: { ielts_bank_managed: '1' },
  });
  _portalConfigurationId = created.id;
  return created.id;
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

  let user;
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    if (error || !data?.user) return res.status(401).json({ error: 'Sign in first.' });
    user = data.user;
  } catch (error) {
    console.error('portal auth lookup error:', error.message);
    return res.status(503).json({
      error: 'Could not verify your billing account. Please try again.',
    });
  }

  let userRow;
  try {
    const { data, error } = await getAdmin()
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    userRow = data;
  } catch (error) {
    console.error('portal account lookup error:', error.message);
    return res.status(503).json({
      error: 'Could not verify your billing account. Please try again.',
    });
  }
  if (!userRow?.stripe_customer_id) {
    return res.status(404).json({ error: 'No billing account yet.' });
  }

  try {
    const { data: allowed, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: 'billing-portal',
      p_identifier: user.id,
      p_window_seconds: PORTAL_WINDOW_SECONDS,
      p_max: PORTAL_MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many billing portal requests. Please wait a few minutes and try again.',
      });
    }
  } catch (error) {
    console.error('portal rate-limit error:', error.message);
    return res.status(503).json({
      error: 'Could not open the billing portal. Please try again.',
    });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (error) {
    console.error('portal Stripe setup error:', error.message);
    return res.status(503).json({ error: 'Could not open the billing portal. Please try again.' });
  }

  // A portal session exposes the customer's invoices, payment methods, tax
  // details, and subscription controls. Do not treat a service-role database
  // pointer as sufficient authorization: require the provider-side user
  // mapping to agree with the authenticated learner before opening the portal.
  let customer;
  try {
    customer = await stripe.customers.retrieve(userRow.stripe_customer_id);
  } catch (error) {
    if (error?.code === 'resource_missing') {
      console.error('portal customer is missing in Stripe');
      return res.status(409).json({
        error: 'Your billing account needs attention. Please contact support.',
        code: 'billing_account_mismatch',
      });
    }
    console.error('portal customer lookup error:', error.message);
    return res.status(503).json({ error: 'Could not open the billing portal. Please try again.' });
  }
  if (customer.deleted || customer.metadata?.user_id !== user.id) {
    console.error('portal customer ownership mismatch');
    return res.status(409).json({
      error: 'Your billing account needs attention. Please contact support.',
      code: 'billing_account_mismatch',
    });
  }

  try {
    const origin =
      process.env.NODE_ENV !== 'production' &&
      typeof req.headers.origin === 'string' &&
      req.headers.origin.startsWith('http://localhost')
        ? req.headers.origin
        : 'https://www.ielts-bank.com';
    const session = await stripe.billingPortal.sessions.create({
      customer: userRow.stripe_customer_id,
      configuration: await portalConfiguration(stripe),
      return_url: `${origin}/billing/manage`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('portal error:', e.message);
    return res.status(503).json({ error: 'Could not open the billing portal. Please try again.' });
  }
}
