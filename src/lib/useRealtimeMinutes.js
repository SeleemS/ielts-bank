// src/lib/useRealtimeMinutes.js
// Reads the signed-in user's Realtime-examiner minutes from their own
// user_quotas row (RLS: owner-select). Display only — the real gate is the
// consume_realtime_seconds RPC at session mint.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from './auth';

export function useRealtimeMinutes() {
  const { user } = useAuth();
  const [state, setState] = React.useState({
    loading: true,
    quotaSeconds: 0,
    remainingSeconds: 0,
    resetsAt: null,
  });

  const refresh = React.useCallback(() => {
    if (!user?.id) {
      setState({ loading: false, quotaSeconds: 0, remainingSeconds: 0, resetsAt: null });
      return;
    }
    getSupabase()
      .from('user_quotas')
      .select('realtime_seconds_quota, realtime_seconds_remaining, realtime_period_resets_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const quota = data?.realtime_seconds_quota || 0;
        const resetsAt = data?.realtime_period_resets_at;
        // Mirror the RPC's refill: an elapsed period displays as a full meter.
        const refilled = resetsAt && new Date(resetsAt).getTime() <= Date.now();
        setState({
          loading: false,
          quotaSeconds: quota,
          remainingSeconds: refilled ? quota : data?.realtime_seconds_remaining || 0,
          resetsAt: resetsAt || null,
        });
      })
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, [user?.id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
