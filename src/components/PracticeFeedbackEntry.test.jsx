// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }));
import PracticeFeedbackEntry, { feedbackEntrySkill } from './PracticeFeedbackEntry';
it('routes skill-specific guidance to the relevant scorer without promising another free sample', () => {
  expect(feedbackEntrySkill('IELTS Speaking: Band 6 to 7')).toBe('speaking');
  expect(feedbackEntrySkill('IELTS Writing Task 2')).toBe('writing');
  expect(feedbackEntrySkill('IELTS Listening matching')).toBeNull();
  const speaking = renderToStaticMarkup(<PracticeFeedbackEntry skill="speaking" source="blog" />);
  expect(speaking).toContain('/speakingquestion?entry=blog_speaking#practice-topics');
  expect(speaking).not.toContain('/ielts-writing-checker');
  expect(speaking).toContain('One free sample per skill, per account');
  expect(speaking).toContain('further AI scoring requires Pro');
  expect(renderToStaticMarkup(<PracticeFeedbackEntry skill="writing" />)).toContain('/ielts-writing-checker?entry=practice_writing');
  expect(renderToStaticMarkup(<PracticeFeedbackEntry skill={null} />)).toBe('');
});
