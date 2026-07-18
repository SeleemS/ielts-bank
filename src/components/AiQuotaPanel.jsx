import * as React from 'react';
import NextLink from 'next/link';
import { Sparkles } from 'lucide-react';
import Modal from './AccessibleModal';
import { getSupabase } from '../../lib/supabase';
import { track } from '../lib/analytics';

export default function AiQuotaPanel({ userId, remaining, open = false, onClose = () => {}, skill = 'speaking' }) {
  const [dbRemaining, setDbRemaining] = React.useState(null);
  const [resetsAt, setResetsAt] = React.useState(null);

  React.useEffect(() => {
    if (!userId) return;
    let active = true;
    getSupabase().from('user_quotas').select('ai_scores_remaining, period_resets_at').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setDbRemaining(data?.ai_scores_remaining ?? 3);
        setResetsAt(data?.period_resets_at || null);
      }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  const shown = remaining ?? dbRemaining;
  return (
    <>
      {userId ? (
        <p className="text-center text-xs font-medium text-muted-foreground">
          {skill === 'writing'
            ? 'Free plan: 1 AI Writing score per day · Premium: 2 per day'
            : shown == null
              ? 'Loading your AI score allowance…'
              : `${shown} of 3 free AI scores left this period`}
        </p>
      ) : null}
      <Modal open={open} onClose={onClose} title="Keep improving with AI feedback">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            You have reached the current free scoring limit{resetsAt ? `, which resets on ${new Date(resetsAt).toLocaleDateString()}` : ''}.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
            <li>Unlimited Writing and Speaking AI scores (fair use)</li>
            <li>Criterion-by-criterion feedback and progress tracking</li>
            <li>Ad-free, with the strongest scoring model</li>
          </ul>
          <NextLink
            href="/pricing"
            onClick={() => track('paywall_upgrade_click', { source: 'quota_modal' })}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to Premium
          </NextLink>
          <p className="text-center text-xs text-muted-foreground">
            From $3.75/mo — cancel anytime.
          </p>
        </div>
      </Modal>
    </>
  );
}
