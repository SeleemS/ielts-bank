export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Cleanup is not configured.' });
  let admin;
  try {
    admin = createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    console.error('cleanup client failed:', error.message);
    return res.status(503).json({ error: 'Cleanup is not configured.' });
  }
  const rateCutoff = new Date(Date.now() - 2 * 864e5).toISOString();
  const audioCutoff = Date.now() - 30 * 864e5;
  try {
    const { error: rateError } = await admin
      .from('rate_limits')
      .delete()
      .lt('window_start', rateCutoff);
    if (rateError) throw rateError;
  } catch (error) {
    console.error('rate-limit cleanup failed:', error.message);
    return res.status(503).json({ error: 'Rate-limit cleanup failed.' });
  }

  let removed = 0;
  try {
    const { data: users, error: userError } = await admin
      .from('users')
      .select('id')
      .limit(5000);
    if (userError) throw userError;
    for (const user of users || []) {
      const { data: files, error: listError } = await admin.storage
        .from('speaking-uploads')
        .list(user.id, { limit: 1000 });
      if (listError) throw listError;
      const old = (files || [])
        .filter(
          (file) =>
            Date.parse(file.created_at || file.updated_at || '') < audioCutoff
        )
        .map((file) => `${user.id}/${file.name}`);
      if (old.length) {
        const { error } = await admin.storage.from('speaking-uploads').remove(old);
        if (error) throw error;
        removed += old.length;
      }
    }
  } catch (error) {
    console.error('upload cleanup failed:', error.message);
    return res.status(503).json({ error: 'Upload cleanup failed.' });
  }
  return res.status(200).json({ ok: true, recordingsRemoved: removed });
}
