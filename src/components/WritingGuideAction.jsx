import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { track } from '../lib/analytics';

// Deliberately selected high-intent Writing guides; leave unrelated lessons alone.
const GUIDES = {
  'band-9-ielts-essay-samples-task-2': 'task-2',
  'ielts-writing-task-2-agree-or-disagree': 'task-2',
  'ielts-writing-task-2-discuss-both-views': 'task-2',
  'ielts-writing-task-2-problem-solution': 'task-2',
  'ielts-writing-task-2-advantages-disadvantages': 'task-2',
  'ielts-writing-task-1-academic-describing-charts': 'task-1',
  'ielts-general-training-writing-task-1-letters': 'general-training-letter',
};

export default function WritingGuideAction({ slug }) {
  const task = GUIDES[slug];
  const element = useRef(null);
  useEffect(() => {
    if (!task || !element.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        track('writing_guide_action_view', { source: slug, task, entry_version: 'current_report_entry_v1' });
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [slug, task]);
  if (!task) return null;
  return <aside ref={element} className="my-8 rounded-xl border border-accent/30 bg-accent/5 p-5">
    <h2 className="text-xl font-bold">Apply this guide to your own {task === 'general-training-letter' ? 'letter' : task === 'task-1' ? 'Task 1 answer' : 'essay'}</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Write your answer, then check it against all four IELTS criteria. Your first AI Writing diagnostic is free with an account: estimated bands, feedback and one correction.</p>
    <Link href={`/ielts-writing-checker/${task}`} onClick={() => track('writing_guide_action_click', { source: slug, task, entry_version: 'current_report_entry_v1' })} className="mt-4 inline-block rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-foreground no-underline">Check my {task === 'general-training-letter' ? 'letter' : 'Writing answer'}</Link>
    <p className="mt-3 text-xs text-muted-foreground">No payment needed for the diagnostic. Additional full feedback is available with Pro.</p>
  </aside>;
}
