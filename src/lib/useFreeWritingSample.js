// src/lib/useFreeWritingSample.js
// Whether the signed-in user's free sample score for an AI skill is currently
// used up (writing since Jul 2026, speaking since Aug 2026).
// Lifetime mode (default): used = the sample was ever taken.
// Weekly mode (NEXT_PUBLIC_FREE_SCORE_PERIOD=weekly, consume_ai_score v10):
// used = taken within the last 7 days, and `nextFreeAt` says when it refills.
// Owner-read of user_quotas (RLS: select own; writes are service-role only) —
// display only, the real gate lives in consume_ai_score.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { FREE_SCORE_PERIOD, isFreeSampleUsed, nextFreeScoreAt } from '../../lib/freeScorePeriod';
import { useAuth } from './auth';

const SAMPLE_COLUMNS = {
  writing: 'free_writing_score_used_at',
  speaking: 'free_speaking_score_used_at',
};

const EMPTY = { usedAt: null, nextFreeAt: null };

// `enabled: false` skips the query entirely (idle state: used = null), for
// surfaces that only need the sample state in weekly mode.
export function useFreeSample(skill, { enabled = true } = {}) {
  const { user } = useAuth();
  const column = SAMPLE_COLUMNS[skill] || SAMPLE_COLUMNS.writing;
  const [state, setState] = React.useState({ loading: true, used: null, ...EMPTY });

  React.useEffect(() => {
    if (!user?.id || !enabled) {
      setState({ loading: false, used: null, ...EMPTY });
      return undefined;
    }
    let active = true;
    setState({ loading: true, used: null, ...EMPTY });
    getSupabase()
      .from('user_quotas')
      .select(column)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setState({ loading: false, used: null, ...EMPTY });
          return;
        }
        // No quota row yet means the sample was never consumed.
        const usedAt = data?.[column] || null;
        const used = isFreeSampleUsed(usedAt, { period: FREE_SCORE_PERIOD });
        setState({
          loading: false,
          used,
          usedAt,
          nextFreeAt: used ? nextFreeScoreAt(usedAt, FREE_SCORE_PERIOD) : null,
        });
      })
      .catch(() => {
        if (active) setState({ loading: false, used: null, ...EMPTY });
      });
    return () => {
      active = false;
    };
  }, [user?.id, column, enabled]);

  return state;
}

export function useFreeWritingSample() {
  return useFreeSample('writing');
}
