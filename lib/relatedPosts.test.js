import { describe, expect, it } from 'vitest';
import { postSkill, relatedPosts } from './relatedPosts';
import { posts } from './posts';

const post = (slug, title, date = 'August 1, 2026', tags) => ({ slug, title, date, ...(tags ? { tags } : {}) });

describe('postSkill', () => {
  it('detects the skill from slug or title', () => {
    expect(postSkill(post('ielts-listening-common-traps', 'Listening traps'))).toBe('listening');
    expect(postSkill(post('ielts-cue-card-describe-a-person-you-admire', 'Describe a person'))).toBe('speaking');
    expect(postSkill(post('how-long-are-ielts-results-valid', 'How long are results valid?'))).toBeNull();
  });
});

describe('relatedPosts', () => {
  const all = [
    post('ielts-writing-task-2-structure', 'IELTS Writing Task 2 Structure'),
    post('ielts-writing-task-2-agree-or-disagree', 'Writing Task 2: Agree or Disagree Essays'),
    post('ielts-writing-task-1-line-graph', 'Writing Task 1: Line Graphs'),
    post('ielts-listening-common-traps', 'Listening Common Traps'),
    post('ielts-speaking-pronunciation', 'Speaking Pronunciation'),
    post('ielts-vocabulary-technology', 'Vocabulary for Technology', 'September 1, 2026'),
  ];

  it('ranks same-skill, overlapping-title posts first and never returns itself', () => {
    const picked = relatedPosts(all[0], all, 3).map((p) => p.slug);
    expect(picked[0]).toBe('ielts-writing-task-2-agree-or-disagree');
    expect(picked).toContain('ielts-writing-task-1-line-graph');
    expect(picked).not.toContain('ielts-writing-task-2-structure');
  });

  it('uses shared tags as the strongest signal', () => {
    const tagged = [...all, post('essay-vocabulary', 'Essay vocabulary', 'July 1, 2026', ['task-2'])];
    const source = { ...all[3], tags: ['task-2'] };
    expect(relatedPosts(source, tagged, 1)[0].slug).toBe('essay-vocabulary');
  });

  it('returns a small payload of slug + title only', () => {
    expect(relatedPosts(all[0], all, 1)[0]).toEqual({
      slug: 'ielts-writing-task-2-agree-or-disagree',
      title: 'Writing Task 2: Agree or Disagree Essays',
    });
  });

  it('gives every live post five related links', () => {
    for (const p of posts) {
      const picked = relatedPosts(p, posts, 5);
      expect(picked, p.slug).toHaveLength(5);
      expect(new Set(picked.map((x) => x.slug)).size).toBe(5);
    }
  });
});
