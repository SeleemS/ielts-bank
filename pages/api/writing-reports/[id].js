import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { fetchPremiumStatus } from '../../../lib/premium';
import { REPORT_ID_RE, reduceForFree } from '../../../lib/writingReport';

let adminClient;
function getAdmin() {
  if (!adminClient) adminClient = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return adminClient;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (req.method === 'POST' && !originAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim())?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to open your report.' });
  const id = req.query.id;
  if (typeof id !== 'string' || !REPORT_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid report.' });
  try {
    const admin = getAdmin();
    const auth = await admin.auth.getUser(token);
    const user = auth.data?.user;
    if (auth.error || !user?.email || user.is_anonymous) return res.status(401).json({ error: 'Sign in to open your report.' });
    const { data: row, error } = await admin.from('writing_reports')
      .select('attempt_id, task, task_type, prompt, result, revision_of, unlocked_at, created_at, attempts(responses)')
      .eq('attempt_id', id).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    // Do not disclose whether another account owns this ID.
    if (!row) return res.status(404).json({ error: 'Report not found in this account.' });
    let unlocked = Boolean(row.unlocked_at);
    let canUnlock = false;
    if (!unlocked) {
      const premium = await fetchPremiumStatus(admin, user.id);
      if (premium.error) throw premium.error;
      canUnlock = premium.isPremium;
      if (req.method === 'POST') {
        if (!canUnlock) return res.status(402).json({ error: 'An active Pro plan is required to unlock this report.' });
        // Replay-safe: no model call and no quota debit. Only first unlock wins.
        const update = await admin.from('writing_reports').update({ unlocked_at: new Date().toISOString() })
          .eq('attempt_id', id).eq('user_id', user.id).is('unlocked_at', null);
        if (update.error) throw update.error;
        unlocked = true;
      }
    }
    if (unlocked && req.method === 'POST') {
      // Operational delivery record, not a behavioral analytics event.
      const delivery = await admin.from('writing_reports').update({ first_opened_at: new Date().toISOString() })
        .eq('attempt_id', id).eq('user_id', user.id).is('first_opened_at', null);
      if (delivery.error) throw delivery.error;
    }
    return res.status(200).json({
      reportId: id, createdAt: row.created_at, taskType: row.task_type,
      prompt: row.prompt, essay: row.attempts?.responses?.essay || '',
      revisionOf: row.revision_of, canUnlock,
      result: { ...(unlocked ? row.result : reduceForFree(row.result)), task: row.task, free: !unlocked, reportId: id },
    });
  } catch (error) {
    console.error('writing report access failed:', error.message);
    return res.status(503).json({ error: 'Could not open your report. Please try again. Your saved report is safe.' });
  }
}
