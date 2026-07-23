export const config = { runtime: 'nodejs' };

// Live slice for the /data dashboard (dashboard_realtime RPC): active
// sessions now, per-minute events for the last hour, recent event feed.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { requestAuthorized, setPrivateHeaders } from '../../../lib/dataDashAuth';

let adminClient = null;
function admin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

function fixture(name) {
  if (process.env.NODE_ENV === 'production' || !process.env.DATA_DASH_FIXTURE_DIR) return null;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.env.DATA_DASH_FIXTURE_DIR, name), 'utf8')
    );
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setPrivateHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requestAuthorized(req)) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const { data, error } = await admin().rpc('dashboard_realtime');
    if (error) throw error;
    return res.status(200).json({ at: new Date().toISOString(), data });
  } catch (error) {
    const fallback = fixture('fixture-realtime.json');
    if (fallback) return res.status(200).json({ at: new Date().toISOString(), data: fallback, fixture: true });
    console.error('dashboard_realtime failed:', error.message);
    return res.status(503).json({ error: 'Stats unavailable.' });
  }
}
