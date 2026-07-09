import HomePage from '../src/pages/HomePage';
import { SKILLS, listPassages } from '../lib/supabase';

export default HomePage;

// SSG: pull live question counts for the homepage credibility strip. Wrapped in
// try/catch so a missing Supabase env / network hiccup at build time falls back
// to static counts instead of failing the build.
export async function getStaticProps() {
  const fallback = { reading: 0, writing: 0, listening: 0, total: 0 };
  try {
    const [reading, writing, listening] = await Promise.all([
      listPassages(SKILLS.reading),
      listPassages(SKILLS.writing),
      listPassages(SKILLS.listening),
    ]);
    const counts = {
      reading: reading.length,
      writing: writing.length,
      listening: listening.length,
      total: reading.length + writing.length + listening.length,
    };
    return { props: { counts }, revalidate: 3600 };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[HomePage] Falling back to static counts:', err?.message || err);
    return { props: { counts: fallback }, revalidate: 3600 };
  }
}
