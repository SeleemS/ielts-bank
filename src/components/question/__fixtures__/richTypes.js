// src/components/question/__fixtures__/richTypes.js
//
// TEMPORARY / DEV-ONLY fixture. Not imported by any page or shipped route — it
// exists purely to exercise the QuestionRenderer + grade.js across EVERY IELTS
// question type (no published DB content uses the richer types yet).
//
// Shape matches getStructuredPassage() output: each question carries a `number`
// (continuous global 1..N) and a structured `answerKey`. Safe to delete.

export const richTypesFixture = {
  id: 'fixture-rich',
  slug: 'fixture-rich',
  skill: 'reading',
  title: 'Renderer coverage fixture',
  difficulty: 'medium',
  bodyHtml: '<p>Fixture passage body. Paragraph A… Paragraph B… Paragraph C…</p>',
  groups: [
    // 1. multiple_choice (single)
    {
      id: 'g-mc',
      position: 0,
      questionType: 'multiple_choice',
      prompt: 'Choose the correct letter.',
      instructionsHtml: '',
      options: [
        { key: 'A', text: 'Alpha', position: 0 },
        { key: 'B', text: 'Bravo', position: 1 },
        { key: 'C', text: 'Charlie', position: 2 },
      ],
      questions: [
        {
          id: 'q1',
          position: 0,
          globalNumber: 1,
          number: 1,
          promptText: 'Which option is correct?',
          answerKey: { accepted: [], correctOptionKeys: ['B'], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 2. multiple_choice_multi (choose TWO)
    {
      id: 'g-mcm',
      position: 1,
      questionType: 'multiple_choice_multi',
      prompt: 'Choose TWO letters.',
      instructionsHtml: '',
      options: [
        { key: 'A', text: 'Reading', position: 0 },
        { key: 'B', text: 'Writing', position: 1 },
        { key: 'C', text: 'Listening', position: 2 },
        { key: 'D', text: 'Speaking', position: 3 },
      ],
      questions: [
        {
          id: 'q2',
          position: 0,
          globalNumber: 2,
          number: 2,
          promptText: 'Select the two correct skills.',
          answerKey: { accepted: [], correctOptionKeys: ['A', 'C'], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 3. true_false_notgiven
    {
      id: 'g-tfng',
      position: 2,
      questionType: 'true_false_notgiven',
      prompt: 'Do the statements agree with the information?',
      instructionsHtml: '',
      options: [],
      questions: [
        {
          id: 'q3',
          position: 0,
          globalNumber: 3,
          number: 3,
          promptText: 'The Earth orbits the Sun.',
          answerKey: { accepted: ['true'], correctOptionKeys: [], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 4. yes_no_notgiven
    {
      id: 'g-ynng',
      position: 3,
      questionType: 'yes_no_notgiven',
      prompt: 'Do the statements agree with the writer’s views?',
      instructionsHtml: '',
      options: [],
      questions: [
        {
          id: 'q4',
          position: 0,
          globalNumber: 4,
          number: 4,
          promptText: 'The writer supports the policy.',
          answerKey: { accepted: ['not given'], correctOptionKeys: [], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 5. matching_information (statement -> paragraph)
    {
      id: 'g-mi',
      position: 4,
      questionType: 'matching_information',
      prompt: 'Which paragraph contains the following information?',
      instructionsHtml: '',
      options: [
        { key: 'A', text: 'Paragraph A', position: 0 },
        { key: 'B', text: 'Paragraph B', position: 1 },
        { key: 'C', text: 'Paragraph C', position: 2 },
      ],
      questions: [
        {
          id: 'q5',
          position: 0,
          globalNumber: 5,
          number: 5,
          promptText: 'A description of the method.',
          answerKey: { accepted: [], correctOptionKeys: ['C'], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 6. matching_headings (paragraph -> heading i/ii/iii)
    {
      id: 'g-mh',
      position: 5,
      questionType: 'matching_headings',
      prompt: 'Choose the correct heading for each paragraph.',
      instructionsHtml: '',
      options: [
        { key: 'i', text: 'Origins of the study', position: 0 },
        { key: 'ii', text: 'Unexpected results', position: 1 },
        { key: 'iii', text: 'Future directions', position: 2 },
      ],
      questions: [
        {
          id: 'q6',
          position: 0,
          globalNumber: 6,
          number: 6,
          promptText: 'Paragraph A',
          answerKey: { accepted: [], correctOptionKeys: ['ii'], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 7. matching_features
    {
      id: 'g-mf',
      position: 6,
      questionType: 'matching_features',
      prompt: 'Match each finding to the correct researcher.',
      instructionsHtml: '',
      options: [
        { key: 'A', text: 'Dr Adams', position: 0 },
        { key: 'B', text: 'Dr Baker', position: 1 },
      ],
      questions: [
        {
          id: 'q7',
          position: 0,
          globalNumber: 7,
          number: 7,
          promptText: 'Discovered the enzyme.',
          answerKey: { accepted: [], correctOptionKeys: ['A'], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 8. matching_sentence_endings
    {
      id: 'g-mse',
      position: 7,
      questionType: 'matching_sentence_endings',
      prompt: 'Complete each sentence with the correct ending.',
      instructionsHtml: '',
      options: [
        { key: 'A', text: 'because of rising costs.', position: 0 },
        { key: 'B', text: 'despite the objections.', position: 1 },
      ],
      questions: [
        {
          id: 'q8',
          position: 0,
          globalNumber: 8,
          number: 8,
          promptText: 'The project was cancelled',
          answerKey: { accepted: [], correctOptionKeys: ['A'], spellingVariants: false, wordLimit: null, normalize: 'lower_trim' },
        },
      ],
    },
    // 9. sentence_completion (word limit + spelling variants)
    {
      id: 'g-sc',
      position: 8,
      questionType: 'sentence_completion',
      prompt: 'Complete the sentences. NO MORE THAN TWO WORDS.',
      instructionsHtml: '<p>The colour of the sample was recorded as <strong>(9)</strong> ___.</p>',
      options: [],
      questions: [
        {
          id: 'q9',
          position: 0,
          globalNumber: 9,
          number: 9,
          promptText: '',
          answerKey: { accepted: ['grey'], correctOptionKeys: [], spellingVariants: true, wordLimit: 2, normalize: 'lower_trim' },
        },
      ],
    },
    // 10. summary_completion
    {
      id: 'g-sum',
      position: 9,
      questionType: 'summary_completion',
      prompt: 'Complete the summary.',
      instructionsHtml: '<p>The team used a new <strong>(10)</strong> ___ to measure output.</p>',
      options: [],
      questions: [
        {
          id: 'q10',
          position: 0,
          globalNumber: 10,
          number: 10,
          promptText: '',
          answerKey: { accepted: ['technique', 'method'], correctOptionKeys: [], spellingVariants: false, wordLimit: 1, normalize: 'lower_trim' },
        },
      ],
    },
    // 11. note_completion
    {
      id: 'g-note',
      position: 10,
      questionType: 'note_completion',
      prompt: 'Complete the notes.',
      instructionsHtml: '<p>Founded in: <strong>(11)</strong> ___</p>',
      options: [],
      questions: [
        {
          id: 'q11',
          position: 0,
          globalNumber: 11,
          number: 11,
          promptText: 'Year founded',
          answerKey: { accepted: ['1998'], correctOptionKeys: [], spellingVariants: false, wordLimit: 1, normalize: 'lower_trim' },
        },
      ],
    },
    // 12. table_completion
    {
      id: 'g-table',
      position: 11,
      questionType: 'table_completion',
      prompt: 'Complete the table.',
      instructionsHtml: '<table><tr><th>Item</th><th>Value</th></tr><tr><td>Capital</td><td>(12) ___</td></tr></table>',
      options: [],
      questions: [
        {
          id: 'q12',
          position: 0,
          globalNumber: 12,
          number: 12,
          promptText: 'Capital city',
          answerKey: { accepted: ['Paris'], correctOptionKeys: [], spellingVariants: false, wordLimit: 1, normalize: 'lower_trim' },
        },
      ],
    },
    // 13. short_answer
    {
      id: 'g-sa',
      position: 12,
      questionType: 'short_answer',
      prompt: 'Answer the questions.',
      instructionsHtml: '',
      options: [],
      questions: [
        {
          id: 'q13',
          position: 0,
          globalNumber: 13,
          number: 13,
          promptText: 'What gas do plants absorb?',
          answerKey: { accepted: ['carbon dioxide', 'co2'], correctOptionKeys: [], spellingVariants: false, wordLimit: 2, normalize: 'lower_trim' },
        },
      ],
    },
  ],
};

export default richTypesFixture;
