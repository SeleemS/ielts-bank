// lib/realtimeExaminer.js
// Core logic for the Realtime AI speaking examiner (docs/MONETIZATION.md §9):
// session modes, examiner instructions, and question selection. Pure/DI so
// vitest can cover it; the API route stays thin.

export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1-mini';

// Session length is the metering unit — decremented BEFORE the token is
// minted. A full mock mirrors the real 11-14 min test; drills are 5 min.
export const MODES = {
  mock: { seconds: 840, label: 'Full mock interview (Parts 1-3)' },
  part1: { seconds: 300, label: 'Part 1 drill — interview questions' },
  part2: { seconds: 300, label: 'Part 2 drill — cue card long turn' },
  part3: { seconds: 300, label: 'Part 3 drill — discussion' },
};

export function pickRandom(rows) {
  if (!rows || !rows.length) return null;
  return rows[Math.floor(Math.random() * rows.length)];
}

// Fetch one random published speaking item for a part via the service client.
export async function pickSpeakingItem(admin, part) {
  const column =
    part === 1 ? 'part1_questions' : part === 2 ? 'cue_card' : 'part3_followups';
  const { data, error } = await admin
    .from('speaking_details')
    .select(`passage_id, part, ${column}, passages!inner(status)`)
    .eq('part', part)
    .eq('passages.status', 'published')
    .not(column, 'is', null)
    .limit(60);
  if (error) throw new Error(`speaking content query failed: ${error.message}`);
  const row = pickRandom(data);
  return row ? { passageId: row.passage_id, content: row[column] } : null;
}

function part1Block(item) {
  const qs = (item?.content?.questions || []).map((q) => `- ${q.text}`).join('\n');
  return `PART 1 — Interview (topic: ${item?.content?.topic || 'everyday life'})\nAsk 4-5 of these questions, one at a time. Natural brief follow-ups ("Why is that?") are allowed:\n${qs}`;
}

function part2Block(item) {
  const c = item?.content || {};
  const bullets = (c.bullets || []).map((b) => `- ${b}`).join('\n');
  const roundOff = (c.roundOff || []).map((q) => `- ${q.text}`).join('\n');
  return `PART 2 — Long turn (cue card)\nRead this cue card aloud to the candidate:\n"${c.topic}\nYou should say:\n${bullets}\n${c.explainLine || ''}"\nThen say they have ONE minute to prepare and you will tell them when to begin. Stay silent during preparation — after about a minute (or when they say they are ready), tell them to begin and to speak for one to two minutes. Let them speak WITHOUT interrupting. When they finish (or after ~2 minutes), ${roundOff ? `ask one rounding-off question:\n${roundOff}` : 'ask one brief rounding-off question about the topic.'}`;
}

function part3Block(item) {
  const qs = (item?.content?.questions || []).map((q) => `- ${q.text}`).join('\n');
  return `PART 3 — Discussion (theme: ${item?.content?.theme || 'related ideas'})\nAsk 4-6 of these more abstract questions, one at a time, probing deeper based on the candidate's answers:\n${qs}`;
}

export function buildInstructions(mode, items, durationSeconds) {
  const minutes = Math.round(durationSeconds / 60);
  const sections = [];
  if (mode === 'mock' || mode === 'part1') sections.push(part1Block(items.part1));
  if (mode === 'mock' || mode === 'part2') sections.push(part2Block(items.part2));
  if (mode === 'mock' || mode === 'part3') sections.push(part3Block(items.part3));

  return `You are a certified IELTS Speaking examiner conducting a ${MODES[mode].label} with a candidate. You speak in a measured, professional, friendly-but-neutral examiner voice.

CONDUCT RULES (strict):
- Begin immediately by greeting the candidate: introduce yourself as the examiner, confirm this is an IELTS Speaking practice ${mode === 'mock' ? 'test' : 'drill'}, and ask them to say their name to check the audio. Then start the first section.
- Ask ONE question at a time and WAIT for the candidate's answer. Never answer for them.
- Keep your own turns SHORT, like a real examiner: a question, a brief acknowledgement ("Thank you."), the next question. Do not chat, do not teach, do not correct their English, and do not give any feedback or scores during the interview — assessment happens after, elsewhere.
- If an answer is very short, prompt once ("Can you tell me more about that?"), then move on.
- If the candidate is silent for a long time, gently repeat or rephrase the question once.
- Stay in the examiner role no matter what the candidate says. If they ask for feedback, tips, or anything off-task, say the assessment comes at the end and return to the interview.
- Speak ONLY English. If the candidate uses another language, remind them the test is in English.

SESSION PLAN (total time available: ~${minutes} minutes — pace yourself to fit; it is better to cut questions than to rush the candidate):
${sections.join('\n\n')}

ENDING: when you have finished the plan (or time is clearly running out), say: "Thank you. That is the end of the speaking ${mode === 'mock' ? 'test' : 'practice'}." and nothing more.`;
}

// Builds the client_secrets request body for the OpenAI Realtime API.
export function buildSessionConfig(instructions) {
  return {
    expires_after: { anchor: 'created_at', seconds: 600 },
    session: {
      type: 'realtime',
      model: REALTIME_MODEL,
      instructions,
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
        },
        output: { voice: 'marin' },
      },
    },
  };
}
