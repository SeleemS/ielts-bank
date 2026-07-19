import * as React from 'react';
import NextLink from 'next/link';
import { Sparkles } from 'lucide-react';
import Modal from './AccessibleModal';
import { usePlan } from '../lib/usePlan';
import { track } from '../lib/analytics';

// Limit modal for AI-scoring CTAs. Writing includes one lifetime free sample;
// after that, this opens in two situations:
//   * a premium user hit the per-skill daily fair-use cap (or an IP limit) —
//     tell them when it resets, no upsell;
//   * a non-premium user hit a limit response we didn't route to /pricing —
//     show the premium pitch.
// The userId / remaining props are kept for call-site compatibility.
export default function AiQuotaPanel({ open = false, onClose = () => {}, skill = 'speaking' }) {
  const { isPremium } = usePlan();
  const impressionRef = React.useRef(false);

  const skillLabel = skill === 'writing' ? 'Writing' : 'Speaking';

  React.useEffect(() => {
    if (!open) {
      impressionRef.current = false;
      return;
    }
    if (impressionRef.current) return;
    impressionRef.current = true;
    track('premium_gate', {
      source: 'quota_modal',
      stage: 'impression',
      skill,
      premium: isPremium,
    });
  }, [isPremium, open, skill]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPremium ? 'You’ve hit today’s fair-use limit' : `AI ${skillLabel} scoring is a Premium feature`}
    >
      <div className="space-y-5">
        {isPremium ? (
          <p className="text-sm leading-6 text-muted-foreground">
            You’ve used today’s included AI {skillLabel} scores. Your allowance resets at
            midnight UTC — come back tomorrow, or review your saved feedback on the
            dashboard in the meantime.
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {skill === 'writing'
                ? 'You’ve used your lifetime free Writing sample. Upgrade to unlock the complete report and continued scoring:'
                : 'AI Speaking scoring is part of Premium. Upgrade to unlock:'}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
              <li>Writing and Speaking AI band scores (fair-use daily limits)</li>
              <li>Criterion-by-criterion feedback and progress tracking</li>
              <li>Live AI examiner minutes and an ad-free experience</li>
            </ul>
            <NextLink
              href={`/pricing?upgrade=${skill}`}
              onClick={() => track('paywall_upgrade_click', { source: 'quota_modal', skill })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to Premium
            </NextLink>
            <p className="text-center text-xs text-muted-foreground">
              From $3.75/mo — cancel anytime.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
