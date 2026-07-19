#!/usr/bin/env node
/** Generate one gap-cluster blog post and prepend it to lib/posts.js. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const postsPath = join(root, 'lib', 'posts.js');
const topics = JSON.parse(readFileSync(join(root, 'scripts', 'content', 'blog-gap-topics.json'), 'utf8'));
const source = readFileSync(postsPath, 'utf8');
const existingSlugs = [...source.matchAll(/slug:\s*["']([^"']+)/g)].map((match) => match[1]);
const env = loadEnv();
if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
const model = env.OPENAI_CONTENT_MODEL || env.OPENAI_WRITING_MODEL || 'gpt-5.1';

const day = new Date().toISOString().slice(0, 10);
const offset = [...day].reduce((sum, char) => sum + char.charCodeAt(0), 0) % topics.length;
const topic = topics.find((_, index) => !existingSlugs.some((slug) => slug.includes(String((index + offset) % topics.length)))) || topics[offset];
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'Write a trustworthy, specific IELTS preparation article for IELTS-Bank. It must be 1,200-1,600 words, original, current, practical and accurate. Use semantic HTML limited to p, h2, h3, ul, ol, li, strong, em and internal a links. Include worked examples and a concrete practice routine. Do not claim affiliation with IELTS owners, real leaked tests, guaranteed bands, official examiner status or unverifiable current test trends. Never call a paid feature free. The Writing Checker offers one free sample score after signup, while the full report and continued scoring are Premium; link to /pricing when describing Premium. Link naturally to relevant /readingquestion, /listeningquestion, /writingquestion, /speakingquestion, /ielts-writing-checker, /band-calculator, /band-estimator or /mock-test pages. Return a timeless title without a year.' },
      { role: 'user', content: `Topic: ${topic}\nExisting slugs to avoid duplicating: ${existingSlugs.join(', ')}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'blog_post', strict: true, schema: { type: 'object', additionalProperties: false, properties: { slug: { type: 'string' }, title: { type: 'string' }, excerpt: { type: 'string' }, content_html: { type: 'string' } }, required: ['slug', 'title', 'excerpt', 'content_html'] } } },
  }),
});
if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
const payload = await response.json();
const post = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(post.slug) || existingSlugs.includes(post.slug)) throw new Error('Generated slug is invalid or duplicated.');
if ((post.content_html.match(/\b\w+\b/g) || []).length < 1000) throw new Error('Generated article is too short.');
if (/<script|<style|javascript:|on\w+=/i.test(post.content_html)) throw new Error('Generated article contains unsafe markup.');

const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const escapedHtml = post.content_html.replaceAll('`', '\\`').replaceAll('${', '\\${');
const entry = `\n  {\n    slug: ${JSON.stringify(post.slug)},\n    title: ${JSON.stringify(post.title)},\n    date: ${JSON.stringify(date)},\n    excerpt: ${JSON.stringify(post.excerpt)},\n    content: \`\n${escapedHtml}\n\`,\n  },`;
writeFileSync(postsPath, source.replace('export const posts = [', `export const posts = [${entry}`));
console.log(`[blog] generated ${post.slug} for topic: ${topic}`);
