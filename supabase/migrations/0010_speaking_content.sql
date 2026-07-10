-- 0010_speaking_content.sql
-- Speaking content model: extend speaking_details so it can carry a full,
-- self-contained IELTS Speaking practice item (Part 1 topic set, Part 2 cue
-- card, or Part 3 discussion set) INCLUDING per-question examiner audio.
--
-- Backward-compatible: only ADDs a column; existing cue_card / part3_followups
-- columns keep their meaning. One `passages` row per practice item, with
-- module = NULL (Speaking is single-module), status = 'published',
-- source = 'ai-authored'.
--
-- ===========================================================================
-- FINAL JSONB SHAPES  (the UX / scoring waves consume these verbatim)
-- ===========================================================================
-- speaking_details.part = 1 | 2 | 3 selects which column is populated.
-- Every question carries an `audioPath` = the STORAGE PATH (NOT a full URL) of
-- the examiner reading it aloud, in the public `listening-audio` bucket:
--     speaking/<passage-slug>/<key>.mp3
-- Public URL is derived by the app as:
--     ${SUPABASE_URL}/storage/v1/object/public/listening-audio/<audioPath>
--
-- Part 1  (part = 1)  ->  part1_questions jsonb  (NEW column):
--   {
--     "topic": "Home / Hometown",
--     "questions": [
--       { "text": "Where is your hometown?", "audioPath": "speaking/<slug>/q1.mp3" },
--       ... 4-5 questions ...
--     ]
--   }
--
-- Part 2  (part = 2)  ->  cue_card jsonb:
--   {
--     "topic": "Describe a book that influenced you.",
--     "bullets": ["what the book was", "when you read it", "what it was about"],
--     "explainLine": "and explain how it influenced you.",
--     "prepSeconds": 60,
--     "speakSecondsMin": 60,
--     "speakSecondsMax": 120,
--     "audioPath": "speaking/<slug>/cue.mp3",          -- examiner reads the whole cue card
--     "roundOff": [                                     -- optional rounding-off questions
--       { "text": "Do you often read books like this?", "audioPath": "speaking/<slug>/r1.mp3" }
--     ]
--   }
--
-- Part 3  (part = 3)  ->  part3_followups jsonb:
--   {
--     "theme": "Books and reading",
--     "questions": [
--       { "text": "Why do some people prefer e-books to printed books?", "audioPath": "speaking/<slug>/q1.mp3" },
--       ... 5-6 escalating abstract questions ...
--     ]
--   }
-- ===========================================================================

alter table public.speaking_details
  add column if not exists part1_questions jsonb;

comment on column public.speaking_details.part1_questions is
  'Part 1 topic set: { topic, questions:[{text, audioPath}] }. audioPath = storage path in listening-audio bucket (speaking/<slug>/qN.mp3).';
comment on column public.speaking_details.cue_card is
  'Part 2 cue card: { topic, bullets[], explainLine, prepSeconds, speakSecondsMin, speakSecondsMax, audioPath, roundOff:[{text,audioPath}] }.';
comment on column public.speaking_details.part3_followups is
  'Part 3 discussion set: { theme, questions:[{text, audioPath}] } (5-6 abstract follow-ups).';
