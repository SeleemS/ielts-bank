import HomePage from '../src/pages/HomePage';
import {
  SKILLS,
  countQuestions,
  getPublicTrustStats,
  listPassages,
  listSpeakingItems,
} from '../lib/supabase';

export default HomePage;

// SSG: pull live question counts for the homepage credibility strip. Wrapped in
// try/catch so a missing Supabase env / network hiccup at build time falls back
// to static counts instead of failing the build.
export async function getStaticProps() {
  const fallback = {
    reading: 0,
    writing: 0,
    listening: 0,
    speaking: 0,
    total: 0,
    questions: 0,
    questionsAnswered: 0,
  };
  try {
    const [reading, writing, listening, speaking, questions] = await Promise.all([
      listPassages(SKILLS.reading),
      listPassages(SKILLS.writing),
      listPassages(SKILLS.listening),
      listSpeakingItems(),
      countQuestions(),
    ]);
    let questionsAnswered = 0;
    try {
      const trust = await getPublicTrustStats();
      questionsAnswered = trust.questionsAnswered;
    } catch (trustError) {
      // Keep all content counts if the aggregate RPC is temporarily
      // unavailable or the deployment is ahead of its database migration.
      // eslint-disable-next-line no-console
      console.warn('[HomePage] Trust stats unavailable:', trustError?.message || trustError);
    }
    const counts = {
      reading: reading.length,
      writing: writing.length,
      listening: listening.length,
      speaking: speaking.length,
      total: reading.length + writing.length + listening.length + speaking.length,
      questions,
      questionsAnswered,
    };
    return { props: { counts }, revalidate: 3600 };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[HomePage] Falling back to static counts:', err?.message || err);
    return { props: { counts: fallback }, revalidate: 3600 };
  }
}
