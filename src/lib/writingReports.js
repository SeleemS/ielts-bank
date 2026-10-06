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
