import AnswerKeyPage from '../../../src/pages/AnswerKeyPage';
import { SKILLS } from '../../../lib/supabase';
import { answerKeyStaticPaths, answerKeyStaticProps } from '../../../lib/answerKeyPages';

// /readingquestion/<slug>/answers — answer key with explanations and the
// evidence sentence/paragraph for one Reading passage (built by lib/answerKeys.js).
export default AnswerKeyPage;

export async function getStaticPaths() {
  return answerKeyStaticPaths(SKILLS.reading);
}

export async function getStaticProps({ params }) {
  return answerKeyStaticProps(SKILLS.reading, params.id);
}
