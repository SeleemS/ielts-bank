import SpeakingQuestion from '../../src/pages/SpeakingQuestion';
import {
  SKILLS,
  getPassageSlugs,
  getSpeakingItem,
  getRelatedPractice,
} from '../../lib/supabase';
import { canonicalQuestionRedirect, retiredDuplicateTarget } from '../../lib/questionUrls';
import { questionContextLinks } from '../../lib/siteDirectory';

export default SpeakingQuestion;

// Build a short meta description from the item's topic/theme.
function describe(item) {
  const topic = item?.topic || item?.title || 'IELTS Speaking';
  return `Practise IELTS Speaking Part ${item?.part} — "${topic}". Hear the examiner, record your answer, and get instant AI band feedback.`;
}

export async function getStaticPaths() {
  // Pre-render each passage's CANONICAL URL only: the clean slug (see
  // lib/questionUrls.js). Legacy Firestore-id URLs still resolve via
  // fallback: 'blocking' and permanently redirect to the slug.
  const slugs = await getPassageSlugs(SKILLS.speaking);
  const ids = slugs.filter((slug) => !retiredDuplicateTarget('speaking', slug));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const item = await getSpeakingItem(params.id);
  if (!item) return { notFound: true };
  const redirect = canonicalQuestionRedirect('speaking', params.id, item);
  if (redirect) return redirect;
  const related = await getRelatedPractice(SKILLS.speaking, item.slug, item.part);

  return {
    props: {
      id: params.id,
      item,
      description: describe(item),
      related,
      contextLinks: questionContextLinks('speaking', item),
    },
    revalidate: 3600,
  };
}
