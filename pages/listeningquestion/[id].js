import ListeningQuestion from '../../src/pages/ListeningQuestion';
import {
  SKILLS,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';
import { answerPageEligible, answersPath } from '../../lib/answerKeys';
import { canonicalQuestionRedirect, retiredDuplicateTarget } from '../../lib/questionUrls';
import { questionContextLinks } from '../../lib/siteDirectory';

export default ListeningQuestion;

export async function getStaticPaths() {
  // Pre-render each passage's CANONICAL URL only: the clean slug (see
  // lib/questionUrls.js). Legacy Firestore-id URLs still resolve via
  // fallback: 'blocking' and permanently redirect to the slug.
  const slugs = await getPassageSlugs(SKILLS.listening);
  const ids = slugs.filter((slug) => !retiredDuplicateTarget('listening', slug));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const passage = await getStructuredPassage(SKILLS.listening, params.id);
  if (!passage) return { notFound: true };
  const redirect = canonicalQuestionRedirect('listening', params.id, passage);
  if (redirect) return redirect;
  const related = await getRelatedPractice(
    SKILLS.listening,
    passage.slug,
    passage.groups?.[0]?.questionType
  );

  const description =
    toMetaDescription(passage.bodyHtml) ||
    `Practise IELTS Listening with "${passage.title}". Listen to the audio and answer the questions.`;

  return {
    props: {
      id: params.id,
      passage,
      description,
      related,
      // Link to the answer-key page only when one is published for this passage.
      answersHref: answerPageEligible(passage) ? answersPath(SKILLS.listening, passage.slug) : null,
      contextLinks: questionContextLinks('listening', passage),
    },
    revalidate: 3600,
  };
}
