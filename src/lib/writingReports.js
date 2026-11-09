import { getSupabase } from '../../lib/supabase';
import { getSessionAccess } from './sessionAccess';

export async function requestWritingReport(id, method = 'GET') {
  const session = await getSessionAccess(getSupabase);
  if (session.error || !session.accessToken) throw new Error('Please sign in again to open your report.');
  const response = await fetch(`/api/writing-reports/${encodeURIComponent(id)}`, {
    method, headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not open your report. Please try again.');
  return body;
}

// After a single-report checkout: ask the server to confirm the Stripe session
// and open the report. Resolves true once the report is unlocked.
export async function confirmReportUnlock(id, sessionId) {
  const session = await getSessionAccess(getSupabase);
  if (session.error || !session.accessToken) return false;
  const response = await fetch('/api/billing/report-unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ reportId: id, sessionId }),
  });
  const body = await response.json().catch(() => ({}));
  return response.ok && body.unlocked === true;
}
