// lib/questionBankData.js
// SERVER-ONLY loader for /ielts-question-bank. Reads the same lists the skill
// hubs render (lib/supabase.js listPassages, lib/speakingHubs.js, the answer-
// key eligibility check, the essay-bank catalogue), so every number on the
// hub matches what a learner finds one click later. Import it only from
// getStaticProps: it pulls in fs (lib/essays.js) and the answer-key builder.

import {
  SKILLS,
  getSupabase,
  listMockTests,
  listPassages,
  listPassagesByListeningPart,
  listWritingModelAnswers,
} from './supabase';
import { listSpeakingHubItems } from './speakingHubs';
import { listAnswerKeySlugs } from './answerKeyPages';
import { essays } from './essays';
import { buildCatalogue } from './essayBankCatalogue';

// Individual questions attached to the published passages of one skill.
async function countSkillQuestions(skill) {
  const { count, error } = await getSupabase()
    .from('questions')
    .select('id, passages!inner(skill, status)', { count: 'exact', head: true })
    .eq('passages.skill', skill)
    .eq('passages.status', 'published');
  if (error) throw error;
  return count || 0;
}

// Optional extras degrade to "not shown" instead of failing the page.
async function optional(label, loader, fallback) {
  try {
    return await loader();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ielts-question-bank] ${label} unavailable:`, err?.message || err);
    return fallback;
  }
}

export async function loadQuestionBankRaw() {
  // Core lists: a failure throws, so ISR keeps serving the last good page
  // rather than publishing zeros.
  const [readingItems, listeningItems, writingItems, speakingItems, readingQuestions, listeningQuestions] =
    await Promise.all([
      listPassages(SKILLS.reading, { withQuestionTypes: true }),
      listPassages(SKILLS.listening),
      listPassages(SKILLS.writing),
      listSpeakingHubItems(),
      countSkillQuestions(SKILLS.reading),
      countSkillQuestions(SKILLS.listening),
    ]);

  const [partLists, readingKeys, listeningKeys, catalogue, mockTests] = await Promise.all([
    optional('listening parts', () => Promise.all([1, 2, 3, 4].map((part) => listPassagesByListeningPart(part))), []),
    optional('reading answer keys', () => listAnswerKeySlugs(SKILLS.reading), []),
    optional('listening answer keys', () => listAnswerKeySlugs(SKILLS.listening), []),
    optional('essay catalogue', async () => buildCatalogue(await listWritingModelAnswers()), []),
    optional('mock tests', listMockTests, []),
  ]);

  return {
    readingItems: readingItems.map(({ id, title, questionTypes }) => ({ id, title, questionTypes: questionTypes || [] })),
    listeningItems: listeningItems.map(({ id, title }) => ({ id, title })),
    writingItems: writingItems.map(({ id, title }) => ({ id, title })),
    speakingItems: speakingItems.map(({ slug, part }) => ({ slug, part })),
    readingQuestions,
    listeningQuestions,
    listeningPartCounts: Object.fromEntries(partLists.map((list, i) => [i + 1, list.length])),
    answerKeySlugs: { reading: readingKeys, listening: listeningKeys },
    // Same total the essay-bank hub puts in its title.
    essayBankCount: essays.length + catalogue.length,
    mockTestCount: mockTests.length,
  };
}
