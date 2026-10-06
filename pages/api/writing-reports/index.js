import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim())?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to see your reports.' });
  try {
    const admin = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.email || data.user.is_anonymous) return res.status(401).json({ error: 'Sign in to see your reports.' });
    const reports = await admin.from('writing_reports').select('attempt_id, task_type, unlocked_at, created_at')
      .eq('user_id', data.user.id).order('created_at', { ascending: false }).limit(100);
    if (reports.error) throw reports.error;
    return res.status(200).json({ reports: reports.data || [] });
  } catch (error) {
    console.error('writing report list failed:', error.message);
    return res.status(503).json({ error: 'Could not load your reports. Please try again.' });
  }
}
