import * as React from 'react';
import Modal from './AccessibleModal';
import NewsletterSignup from './NewsletterSignup';
import { getSupabase } from '../../lib/supabase';

export default function AiQuotaPanel({ userId, remaining, open = false, onClose = () => {} }) {
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
          {shown == null ? 'Loading your AI score allowance…' : `${shown} of 3 free AI scores left this period`}
        </p>
      ) : null}
      <Modal open={open} onClose={onClose} title="Keep improving with AI feedback">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            You have reached the current free scoring limit{resetsAt ? `, which resets on ${new Date(resetsAt).toLocaleDateString()}` : ''}.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
            <li>More Writing and Speaking scoring each month</li>
            <li>Criterion-by-criterion feedback and progress tracking</li>
            <li>Priority access when the premium plan opens</li>
          </ul>
          <NewsletterSignup source="premium-waitlist" />
        </div>
      </Modal>
    </>
  );
}
