export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { getMockTest } from '../../../lib/supabase';
import { fetchIsPremium } from '../../../lib/premium';

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return res.status(401).json({ error: 'Sign in first.' });
  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) return res.status(401).json({ error: 'Sign in first.' });
  if (!(await fetchIsPremium(admin, data.user.id))) {
    return res.status(402).json({ error: 'Premium is required.', reason: 'premium_required' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid mock test.' });
  }
  try {
    const mock = await getMockTest(slug);
    if (!mock?.sections?.length) return res.status(404).json({ error: 'Mock test not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ mock });
  } catch (mockError) {
    console.error('protected mock load failed:', mockError.message);
    return res.status(503).json({ error: 'Could not load this mock test.' });
  }
}
