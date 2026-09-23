import React from 'react';
import NextLink from 'next/link';
import { ArrowRight, BookOpenCheck } from 'lucide-react';
import { track } from '../lib/analytics';

// Link from a Reading/Listening practice page to its answer-key page
// (/…question/<slug>/answers). `placement="results"` is the post-submit card
// in the review area; `placement="footer"` is the quiet end-of-page link that
// keeps the answers page internally linked (crawlable) without spoiling the
// test for someone about to take it.
export default function AnswerKeyLink({ href, title, skill, placement = 'footer' }) {
  if (!href) return null;
  const onClick = () => track('answers_link_click', { skill, placement, href });

  if (placement === 'results') {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">Review every answer</span> — explanations, the exact{' '}
            {skill === 'listening' ? 'transcript line' : 'sentence and paragraph'} for each question,
            and question-type tips.
          </p>
        </div>
        <NextLink
          href={href}
          onClick={onClick}
          data-analytics-id="practice-answers-link-results"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline"
        >
          Full answer key <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </NextLink>
      </div>
    );
  }

  return (
    <p className="mt-8 text-center text-sm text-muted-foreground">
      Finished the test?{' '}
      <NextLink
        href={href}
        onClick={onClick}
        data-analytics-id="practice-answers-link-footer"
        className="font-semibold text-accent"
      >
        {title} {skill === 'listening' ? 'Listening' : 'Reading'} answers with explanations
      </NextLink>
    </p>
  );
}
