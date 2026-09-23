import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';
import { track } from '../lib/analytics';
import { ENTRY_VERSION } from '../../lib/monetizationExperiment';
import { freeScoreCopy } from '../../lib/freeScorePeriod';

export function feedbackEntrySkill(title = '') {
  if (/speaking/i.test(title)) return 'speaking';
  if (/writing|essay/i.test(title)) return 'writing';
  return null;
}

export default function PracticeFeedbackEntry({ skill, source = 'practice_index' }) {
  if (!['writing', 'speaking'].includes(skill)) return null;
  const speaking = skill === 'speaking';
  const entry = `${source === 'blog' ? 'blog' : 'practice'}_${skill}`;
  const href = speaking ? `/speakingquestion?entry=${entry}#practice-topics` : `/ielts-writing-checker?entry=${entry}`;
  return (
    <section aria-label={`${speaking ? 'Speaking' : 'Writing'} feedback practice`} className="my-8 rounded-xl border border-accent/25 bg-accent/5 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">Put it into practice</p>
      <h2 className="mt-2 text-xl font-bold text-foreground">{speaking ? 'Try this in your next spoken answer' : 'Find one thing to improve in your essay'}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{speaking ? 'Choose a topic, record an answer and use your first Speaking sample score to choose a practice target.' : 'Bring an essay you have written and use your first Writing sample score to choose a practice target.'} {freeScoreCopy().practiceEntry}</p>
      <NextLink href={href} onClick={() => track('practice_feedback_entry_click', { skill, source, entry_version: ENTRY_VERSION })} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground no-underline">
        {speaking ? 'Choose a Speaking topic' : 'Try the Writing checker'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </NextLink>
    </section>
  );
}
