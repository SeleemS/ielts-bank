import * as React from 'react';
import { track } from '../lib/analytics';
import { OFFER_VERSION } from '../../lib/monetizationExperiment';

// Fictional examples, never the learner's withheld sample feedback.
export default function FeedbackPreview({ skill = 'writing' }) {
  const speaking = skill === 'speaking';
  return (
    <details className="mt-4 rounded-lg border border-border bg-card p-4" onToggle={event => {
      if (event.currentTarget.open) track('feedback_preview_open', { skill, offer_version: OFFER_VERSION });
    }}>
      <summary className="cursor-pointer text-sm font-semibold text-foreground">See an example of the feedback</summary>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
        <p className="text-xs font-medium">Illustrative excerpt from a full {speaking ? 'Speaking' : 'Writing'} report — not your result or a promised band score.</p>
        <div>
          <p className="font-semibold text-foreground">{speaking ? 'Fluency & coherence' : 'Task response'}</p>
          <p>{speaking ? 'Your answer gives a clear preference. Develop it with a specific experience instead of repeating the reason.' : 'Your position is clear. Develop the public-transport argument with a specific example and explain its consequence.'}</p>
        </div>
        <div className="rounded-md bg-secondary/60 p-3">
          <p className="font-semibold text-foreground">{speaking ? 'A phrase to improve' : 'A sentence to improve'}</p>
          <p>“{speaking ? 'I very like travel because it is good.' : 'More buses is good for people.'}”</p>
          <p className="mt-1 text-foreground">→ “{speaking ? 'I really enjoy travelling because it lets me experience unfamiliar places.' : 'More frequent buses can shorten commuters’ waiting times.'}”</p>
          <p className="mt-1">{speaking ? 'Use “really enjoy” and give a specific reason.' : 'Use subject–verb agreement and state a concrete benefit.'}</p>
        </div>
        <p><span className="font-semibold text-foreground">Next practice:</span> {speaking ? 'Record another answer with one personal example and a short conclusion.' : 'Write a new paragraph that connects a claim, an example and its consequence.'}</p>
        {speaking ? <p className="text-xs">Recorded-answer feedback covers fluency/coherence, vocabulary and grammar. Pronunciation is not assessed by this transcript report.</p> : null}
      </div>
    </details>
  );
}
