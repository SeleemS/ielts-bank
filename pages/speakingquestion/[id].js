import SpeakingQuestion from '../../src/pages/SpeakingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getSpeakingItem,
} from '../../lib/supabase';

export default SpeakingQuestion;

// Build a short meta description from the item's topic/theme.
function describe(item) {
  const topic = item?.topic || item?.title || 'IELTS Speaking';
  return `Practise IELTS Speaking Part ${item?.part} — "${topic}". Hear the examiner, record your answer, and get instant AI band feedback.`;
}

export async function getStaticPaths() {
  // Pre-render both new slugs and any legacy Firestore ids.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.speaking),
    getPassageSlugs(SKILLS.speaking),
  ]);
  const ids = Array.from(new Set([...Object.keys(legacyMap), ...slugs]));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const item = await getSpeakingItem(params.id);
  if (!item) return { notFound: true };

  return {
    props: {
      id: params.id,
      item,
      description: describe(item),
    },
    revalidate: 3600,
  };
}
