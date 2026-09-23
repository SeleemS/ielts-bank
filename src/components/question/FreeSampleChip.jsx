import * as React from 'react';
import NextLink from 'next/link';
import { Sparkles } from 'lucide-react';
import { usePlan } from '../../lib/usePlan';
import { useAuth } from '../../lib/auth';
import { useFreeWritingSample } from '../../lib/useFreeWritingSample';
import { freeScoreCopy, nextFreeScoreHint } from '../../../lib/freeScorePeriod';

// Small status line under the writing submit CTA so the free-sample state is
// visible BEFORE the user composes a whole essay and gets a 402: either the
// free score is still available (activation nudge) or it's spent and Pro will
// score this essay (expectation-setting, with the price inline). In weekly
// mode (NEXT_PUBLIC_FREE_SCORE_PERIOD=weekly) a spent sample also says when
// the next free score unlocks.
export default function FreeSampleChip({ className = '' }) {
  const { user } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const { loading: sampleLoading, used, nextFreeAt } = useFreeWritingSample();
  const copy = freeScoreCopy();
  const refillHint = used ? nextFreeScoreHint(nextFreeAt, { skill: 'writing' }) : '';

  if (planLoading || isPremium) return null;
  if (user?.id && (sampleLoading || used === null)) return null;

  return (
    <p
      className={`mx-auto max-w-md text-center text-xs font-medium text-muted-foreground ${className}`}
    >
      {!user?.id ? (
        <>
          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {copy.chipSignedOut}
        </>
      ) : used ? (
        <>
          {copy.chipUsed}{refillHint ? ` ${refillHint}` : ''}{' '}
          <NextLink href="/pricing?upgrade=writing" className="font-semibold text-accent">
            See Pro plans
          </NextLink>
          .
        </>
      ) : (
        <>
          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {copy.chipAvailable}
        </>
      )}
    </p>
  );
}
