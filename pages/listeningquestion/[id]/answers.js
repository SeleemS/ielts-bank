import AnswerKeyPage from '../../../src/pages/AnswerKeyPage';
import { SKILLS } from '../../../lib/supabase';
import { answerKeyStaticPaths, answerKeyStaticProps } from '../../../lib/answerKeyPages';

// /listeningquestion/<slug>/answers — answer key with explanations and the
// transcript excerpt for each answer (built by lib/answerKeys.js).
export default AnswerKeyPage;

export async function getStaticPaths() {
  return answerKeyStaticPaths(SKILLS.listening);
}

export async function getStaticProps({ params }) {
  return answerKeyStaticProps(SKILLS.listening, params.id);
}
