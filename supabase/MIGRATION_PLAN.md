# IELTS-Bank — Firebase → Supabase Migration Plan

Status: **Planning + scaffolding complete. Nothing is connected to a live Supabase project yet.**
Everything added is additive (new files) or gated behind env vars. The current
Firebase-backed site keeps building and serving until cutover.

---

## 1. Why migrate

The app runs on Firebase (Firestore + Firebase Storage; Firebase Auth was only
_planned_). Target: **Supabase** (Postgres + Supabase Auth + Supabase Storage +
Row-Level Security). Motivation: a real relational schema that supports the full
IELTS spec (not just the 4 question types shipped today), owner-only user data
with RLS, server-authored AI scores, and SQL we can index and query.

Current data volume is tiny: **~55 documents** total
(readingPassages ≈ 31, writingPassages ≈ 23 Task-2 only, listeningPassages = 1
placeholder). Traffic is low. That shapes the cutover recommendation below.

---

## 2. Current state (verified from code)

| Concern | Today |
|---|---|
| Framework | Next.js 14 **pages router**, Chakra UI 2, Vercel |
| Data | Firestore, 3 collections, config hardcoded in `src/firebase.js` (project `ieltsbank-a2bc1`) |
| Question pages | SSG/ISR via `lib/passages.js` — `getStaticPaths` `fallback:'blocking'`, `revalidate:3600` |
| Client reads | `src/components/DataTable.js` reads Firestore directly in the browser |
| Writing scoring | POST to an **unauthenticated** AWS API Gateway GPT-4 endpoint in `src/pages/WritingQuestion.js` |
| Listening audio | Full Firebase Storage **download URL** stored on the doc (`audioUrl`) |
| Reading/Listening body | Rendered via `dangerouslySetInnerHTML` |
| Route ids | The Firestore **document id** is the URL param; **writing ids contain spaces** |

### Inferred Firestore document shapes

```
readingPassages/<id> {
  passageTitle: string,
  passageText:  string(HTML),
  passageType?: string,
  passageDifficulty: 'Easy' | 'Medium' | 'Hard',
  questionGroups: [{
    prompt: string,
    questionType: 'True or False' | 'Yes or No' | 'Match' | 'Short Answer',
    options: string[],                 // full option strings (Match/MCQ)
    questions: [{ text: string, answer: string }]   // single-string answer
  }]
}
writingPassages/<id> {                 // Task 2 only
  passageTitle, passageText, passageType?, passageDifficulty: 'Task 2'
}
listeningPassages/<id> {               // like reading, plus:
  audioUrl: string                     // full Firebase Storage download URL
}
```

Scoring today (Reading/Listening): the answer key ships to the browser inside
the passage doc, and grading is a client-side
`userAnswer.trim().toLowerCase() === answer.toLowerCase()` comparison. **The new
schema preserves this**: `answer_keys` are world-readable so client-side scoring
keeps working. (Hardening to server-side scoring is an _open decision_, §10.)

---

## 3. Target Postgres schema

Migrations live under `supabase/migrations/` and are numbered to run in order:

| File | Contents |
|---|---|
| `0001_extensions_and_enums.sql` | `pgcrypto`, `citext`; enums: `skill`, `module`, `content_status`, `difficulty`, `question_type` (17 IELTS types), `normalize_policy` |
| `0002_core_content.sql` | `rubrics`, `passages`, `writing_details`, `speaking_details`, `listening_details`, `question_groups`, `group_options`, `questions`, `answer_keys` + `set_updated_at()` |
| `0003_tests_and_bands.sql` | `mock_tests`, `mock_test_sections`, `band_tables`, `band_table_rows` |
| `0004_users_attempts_scores.sql` | `users`, `user_quotas`, `attempts`, `scores`, `ingest_queue` |
| `0005_rls_policies.sql` | RLS enabled everywhere + policies (§4) |
| `0006_auth_trigger.sql` | `handle_new_user()` / `handle_user_update()` triggers on `auth.users` (§5) |
| `0007_storage_buckets.sql` | `listening-audio` (public) + `speaking-uploads` (owner-only) buckets & policies (§6) |

### Key tables & columns

- **passages** — spine of the content model. `id uuid`, `slug` (unique, new
  stable id), `legacy_firestore_id` (unique; the OLD doc id — critical for
  redirecting existing SSG URLs and the migration's idempotency key), `skill`,
  `module` (nullable), `title`, `body_html` (Reading/Listening HTML),
  `difficulty`, `topic_tags text[]`, `status`, `source`, timestamps.
  Indexes: `slug` (unique), `(skill, module, status)`, `legacy_firestore_id`,
  GIN on `topic_tags`.
- **writing_details** — `task int`, `prompt_html`, `chart_image_path` (Task 1
  chart, a storage path not a URL), `word_limit_min`, `rubric_id`.
- **speaking_details** — `part int`, `cue_card jsonb` (topic, bullets,
  prep/speak seconds), `part3_followups jsonb`, `rubric_id`.
- **listening_details** — `audio_path` (**storage path, not a token URL**),
  `legacy_audio_url` (the old Firebase URL, kept for reference), `transcript_html`,
  `voices jsonb`.
- **question_groups** — `passage_id`, `position`, `question_type` (enum),
  `prompt`, `instructions_html`.
- **group_options** — separates the **option KEY** (`A`/`B`/`i`/`ii`) from
  **display_text**, so MCQ/matching aren't brittle. Unique `(group, option_key)`.
- **questions** — `question_group_id`, `passage_id` (denormalised for scoring),
  `position`, `global_number` (continuous 1..N, matches today's UI numbering),
  `prompt_text`.
- **answer_keys** — one per question, consumed **uniformly** by auto-scoring:
  `accepted text[]` (case-insensitive per `normalize`), `correct_option_keys
  text[]` (choice/matching types), `spelling_variants boolean`,
  `word_limit int null`, `normalize normalize_policy`.
- **mock_tests** / **mock_test_sections** — compose passages into ordered,
  timed sections (`time_limit_seconds`); a test can span skills.
- **band_tables** / **band_table_rows** — raw-correct → band conversion,
  parameterised by `(skill, module)` because Academic vs GT Reading curves
  differ. Rows are `[raw_min, raw_max] → band numeric(2,1)`.
- **users** — 1:1 with `auth.users` (`id` FK), `email citext`, `display_name`,
  `is_anonymous`, `target_band`.
- **user_quotas** — `ai_scores_remaining`, `period_resets_at`; **read by owner,
  written only by service role** (kept out of `users` so owners can't top up).
- **attempts** — a submission; `responses jsonb`, `raw_score`, `band`,
  timestamps. **Immutable after insert** (no update/delete policy).
- **scores** — AI writing/speaking result; `overall_band`, per-criterion
  `criteria jsonb`, `model` (which model produced it), `feedback_html`.
  **Written only by the service role.**
- **ingest_queue** — content-pipeline staging; **no client access at all**.

### Full IELTS question-type coverage

`question_type` enum covers all 17 target types: `multiple_choice`,
`multiple_choice_multi`, `true_false_notgiven`, `yes_no_notgiven`,
`matching_information`, `matching_headings`, `matching_features`,
`matching_sentence_endings`, `sentence_completion`, `summary_completion`,
`note_completion`, `table_completion`, `flowchart_completion`, `diagram_label`,
`plan_map_diagram_label`, `short_answer`, `form_completion`.

Today's 4 legacy types map to: `true_false_notgiven`, `yes_no_notgiven`,
`short_answer`, and `Match` → **split** into `multiple_choice` vs
`matching_information` (see §7 heuristic).

---

## 4. Row-Level Security (0005)

RLS is **enabled on every table**. The model:

- **Content** (`passages`, groups, options, questions, `answer_keys`,
  `*_details`, `mock_tests`, sections, `band_*`, `rubrics`): world-**readable**
  when the parent passage/test is `published`; drafts are hidden from
  anon/authenticated. **No write policies** exist, so client writes are denied —
  the **service role bypasses RLS** for migration + editorial tooling.
- **users**: owner read/update own row (`auth.uid() = id`). Inserts come from the
  SECURITY DEFINER trigger, not the client.
- **user_quotas**: owner may **read**; **only the service role writes**.
- **attempts**: owner may **insert + read** own rows; **no update/delete** →
  immutable.
- **scores**: owner may **read** own; **only the service role writes** (server
  API route / Edge Function produces AI bands).
- **ingest_queue**: RLS enabled with **no policies** → zero client access.

---

## 5. Auth mapping (0006)

Supabase Auth replaces the previously-planned Firebase Auth.

1. **Anonymous first** — on first visit call `supabase.auth.signInAnonymously()`.
   `auth.users` gets a row (`is_anonymous = true`); the `handle_new_user()`
   trigger mirrors it into `public.users` and seeds `user_quotas`.
2. **Upgrade in place** — the same session links a **Google OAuth** identity or an
   **email magic-link** (`linkIdentity` / `updateUser`). The **auth user id is
   preserved**, so existing `attempts`/`scores` stay attached.
3. **Sync** — `handle_user_update()` keeps `public.users.email` / `is_anonymous`
   current after an upgrade.

Both triggers are `SECURITY DEFINER` so they insert/update past RLS.

---

## 6. Storage (0007)

- **`listening-audio`** — **public read**, service-role write. Holds Listening
  clips referenced by **path** from `listening_details.audio_path`. At build
  time, `getStaticProps` calls `audioPublicUrl(path)` (in `lib/supabase.js`,
  `storage.getPublicUrl`) to embed a stable public URL — replacing the current
  Firebase token URL. During data migration the old `audioUrl` is preserved in
  `legacy_audio_url`; the single real audio file should be re-uploaded into this
  bucket and its `audio_path` set (see §7 caveat).
- **`speaking-uploads`** — **private, owner-only**. Holds user Part-2
  recordings. Path convention `"<uid>/attempt-<id>.webm"`; policies require the
  first path segment to equal `auth.uid()`. Size limit 25 MB; audio MIME types
  only. Listening bucket limit 50 MB.

---

## 7. Data-migration script

`scripts/migrate-firestore-to-supabase.mjs`

- Reads all docs from the 3 collections with the **public firebase client SDK**
  (config mirrors `src/firebase.js`; public reads need no secret).
- Writes to Supabase via `@supabase/supabase-js` using the **service role** key.
- **Idempotent**: upserts `passages` on `legacy_firestore_id`; children
  (groups/options/questions/answer_keys) are deleted-then-reinserted per passage.
- **Guarded**: refuses to run without **both** `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`. Never hardcodes secrets.
- **`--dry-run`** prints exactly what it would insert and **never imports the
  Supabase client or needs creds**. Also `--only=<skill>` and `--limit=N`.

**The `Match` split heuristic:** legacy `Match` is overloaded. In the data, a
`Match` group that is really **multiple choice** stores the _whole option
string_ as each answer (`answer ∈ options`). A genuine **matching** group stores
a short key/label. So: if _every_ question's answer equals one of the group's
options (case-insensitive) → `multiple_choice` (and we synthesise option keys
A/B/C… and set `correct_option_keys`); otherwise → `matching_information` (answer
kept in `accepted`).

Legacy single-string `answer` → `answer_keys.accepted` for text/boolean types;
True/False/Yes-No answers are normalised (`'true'`/`'false'`/`'not given'`).

Run examples:
```bash
node scripts/migrate-firestore-to-supabase.mjs --dry-run
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/migrate-firestore-to-supabase.mjs
```

**Caveat — Listening audio:** the script preserves the old `audioUrl` in
`legacy_audio_url` but does **not** copy the binary into Supabase Storage
(there is 1 file). Re-upload it into `listening-audio` and set
`listening_details.audio_path` as a manual follow-up, or extend the script.

---

## 8. Application refactor plan (executed later, supervised)

New file `lib/supabase.js` already mirrors `lib/passages.js`
(`getPassageBySlug`, `listPassages`, `getPassageSlugs`, `audioPublicUrl`) and
**reassembles the legacy passage shape** so the React components change little.

Exact swaps at cutover (do **not** do these now):

| File | Change |
|---|---|
| `lib/passages.js` | Replace with `lib/supabase.js` calls (or re-export from it). |
| `pages/readingquestion/[id].js` | `getStaticPaths` → `getPassageSlugs('reading')`; `getStaticProps` → `getPassageBySlug('reading', params.id)`. |
| `pages/writingquestion/[id].js` | same with `'writing'`. |
| `pages/listeningquestion/[id].js` | same with `'listening'`; audio path → public URL via `audioPublicUrl`. |
| `pages/*question/index.js` | `listPassages(skill)` from `lib/supabase.js`. |
| `src/components/DataTable.js` | Replace direct Firestore browser read with `listPassages(skill)`; row id becomes `slug`. |
| `src/firebase.js` | **Remove** once nothing imports it. |
| `src/pages/WritingQuestion.js` | Replace the unauthenticated AWS endpoint with a **Next.js API route** (`pages/api/score-writing.js`) or a **Supabase Edge Function** that (a) checks the user session, (b) decrements `user_quotas` via service role, (c) calls the model, (d) writes a `scores` row. Keep the model key server-side. |

**Route-id change (slug vs legacy id):** new routes use `slug`.
`getPassageBySlug` also falls back to `legacy_firestore_id`, and
`getLegacyIdSlugMap` lets us build redirects so existing indexed URLs (including
the space-containing writing ids) keep resolving. Decide redirect vs
dual-accept at cutover (§10).

`@supabase/supabase-js` has been **added to `package.json`** but **not
installed** — run `npm install` at cutover. Firebase deps stay in place until
then.

---

## 9. Cutover, rollback, and the settings the owner must create

### Recommended cutover: **big-bang with a short read-only window**

Given ~55 docs and low traffic, a full strangler/dual-read is overkill.

- **Recommend:** freeze content edits (read-only window, minutes), run the
  migration `--dry-run`, then live, verify counts + a few pages against a
  Supabase **preview/branch** deploy, then flip env + merge the app-refactor
  wave. Add redirects from legacy ids to slugs.
- **Trade-off vs dual-read strangler:** dual-read (read Supabase, fall back to
  Firestore) removes the read-only window and de-risks correctness, but doubles
  the data-access code and keeps Firebase wired in longer. For this data size
  that complexity isn't justified. **Big-bang wins.**

### Rollback

- The app-refactor wave ships on a branch/preview; **the production deploy stays
  on Firebase until the Supabase preview is verified**. Rollback = redeploy the
  previous (Firebase) build — Firestore is untouched and still authoritative
  until we intentionally stop writing to it.
- Migration is idempotent and additive on the Supabase side; re-runnable.
- Keep Firebase project + deps for at least one release after cutover before
  removing `src/firebase.js` and the `firebase` dependency.

### Supabase resources the owner must provision

1. **Create a Supabase project** (Org → New project). Pick a **region** close to
   users / the Vercel deployment region (e.g. `eu-west` or `us-east`; match the
   current AWS `us-east-1` scorer region if the audience is US).
2. **Apply migrations** `0001`→`0007` (Supabase CLI `supabase db push`, or paste
   into the SQL editor in order).
3. **Auth providers**: enable **Anonymous sign-ins**, **Google OAuth** (client
   id/secret + redirect URLs), and **Email magic-link**. Set Site URL +
   redirect allow-list to `https://ielts-bank.com` (and Vercel preview URLs).
4. **Storage buckets**: `0007` creates `listening-audio` (public) and
   `speaking-uploads` (private). Verify in the dashboard; upload the Listening
   audio file and set `audio_path`.
5. **API keys**: copy the project **URL**, **anon** key, and **service_role**
   key from Project Settings → API.

### Exact env vars (names only)

| Var | Used by | Where it goes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app (`lib/supabase.js`, browser + build) | Vercel env (all envs) + local `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app (browser-safe, RLS-guarded) | Vercel env (all envs) + local `.env.local` |
| `SUPABASE_URL` | migration script + server API routes | local shell / `.env.local` (server only); Vercel env for API routes |
| `SUPABASE_SERVICE_ROLE_KEY` | migration script + server scoring route (**secret, never client**) | local shell / `.env.local` (gitignored); Vercel env as a **secret**, server-only — never `NEXT_PUBLIC_` |
| `WRITING_MODEL_API_KEY` (or provider-specific) | replacement writing-scoring API route | Vercel env (secret), server-only |

`.env.local` is already gitignored (`.gitignore` covers `.env*`). **Never**
prefix the service role key with `NEXT_PUBLIC_`.

---

## 10. Open decisions for the owner

1. **Answer-key exposure.** Keep client-side auto-scoring (answer_keys
   world-readable, matches today) **or** move Reading/Listening scoring
   server-side and lock `answer_keys` behind the service role? Server-side is
   more secure but needs an API route and changes the page flow.
2. **Module classification.** Reading/Listening docs have no Academic/GT flag
   today; the migration leaves `module = NULL` (writing defaulted to
   `academic`). Owner should classify, especially before shipping GT-specific
   band tables.
3. **Route ids: slug vs legacy id.** Switch public URLs to slugs (recommended,
   cleaner) with redirects from legacy ids, or keep legacy ids as the canonical
   route to avoid any redirect/SEO risk?
4. **Band tables content.** `band_tables`/`band_table_rows` are empty scaffolding
   — owner must supply the raw→band curves (Academic vs GT Reading, Listening).
5. **Writing scorer replacement.** Next.js API route vs Supabase Edge Function,
   and **which model** (the current AWS endpoint is GPT-4). This also gates
   `user_quotas` enforcement and `scores` writes.
6. **Listening audio.** Only 1 file; migrate it manually into `listening-audio`
   or extend the script to copy binaries?
7. **Anonymous-user retention.** Confirm the anon→Google/email upgrade UX and
   whether anonymous attempts should be retained/merged.
```
