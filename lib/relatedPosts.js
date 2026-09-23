// lib/relatedPosts.js
// "Related guides" for a blog post: the most topically similar other posts,
// computed at build time (pages/blog/[slug].js getStaticProps). Before this,
// posts linked only to /blog and whatever their body happened to mention, so a
// new daily post started life with one inbound link (the /blog index).

const STOP_WORDS = new Set([
  'ielts', 'the', 'and', 'for', 'with', 'how', 'what', 'your', 'you', 'are', 'from', 'that',
  'this', 'into', 'why', 'when', 'can', 'get', 'use', 'vs', 'a', 'an', 'to', 'of', 'in', 'on',
  'is', 'do', 'does', 'it', 'its', 'band', 'guide', 'tips', 'step', 'by', '2025', '2026',
]);

const SKILLS = ['reading', 'writing', 'listening', 'speaking'];

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      // Single digits stay: "Task 1" vs "Task 2", "Part 2" vs "Part 3" matter.
      .filter((word) => (word.length > 2 || /^\d$/.test(word)) && !STOP_WORDS.has(word))
  );
}

// The IELTS skill a post is about, from its slug/title (null if general).
export function postSkill(post) {
  const text = `${post?.slug || ''} ${post?.title || ''}`.toLowerCase();
  if (/cue-card|cue card/.test(text)) return 'speaking';
  return SKILLS.find((skill) => text.includes(skill)) || null;
}

function time(post) {
  const t = new Date(post?.date || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function scoreRelated(post, candidate) {
  const tagsA = new Set(post.tags || []);
  const sharedTags = (candidate.tags || []).filter((tag) => tagsA.has(tag)).length;
  const wordsA = tokens(`${post.title} ${post.slug}`);
  const sharedWords = [...tokens(`${candidate.title} ${candidate.slug}`)].filter((w) => wordsA.has(w)).length;
  const skillA = postSkill(post);
  const sameSkill = skillA && skillA === postSkill(candidate) ? 1 : 0;
  return sharedTags * 3 + sameSkill * 2 + sharedWords;
}

// Top `limit` related posts as { slug, title, excerpt } (small props payload).
// Ties go to the newer post so fresh articles pick up links quickly.
export function relatedPosts(post, allPosts = [], limit = 5) {
  return allPosts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => ({ candidate, score: scoreRelated(post, candidate) }))
    .sort((a, b) => b.score - a.score || time(b.candidate) - time(a.candidate) || a.candidate.slug.localeCompare(b.candidate.slug))
    .slice(0, limit)
    .map(({ candidate }) => ({ slug: candidate.slug, title: candidate.title }));
}
