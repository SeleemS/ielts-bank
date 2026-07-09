// Inspect existing migrated passages' RAW relational rows to confirm the exact
// storage casing/structure our new content must replicate for grading parity.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const slugs = process.argv.slice(2);

async function listTitles() {
  const { data, error } = await supabase
    .from('passages')
    .select('slug, skill, title')
    .order('title');
  if (error) throw error;
  const bySkill = {};
  for (const r of data) (bySkill[r.skill] ||= []).push(r.title);
  console.log('=== EXISTING TITLES BY SKILL ===');
  for (const k of Object.keys(bySkill)) {
    console.log(`\n[${k}] (${bySkill[k].length})`);
    console.log(bySkill[k].map((t) => ' - ' + t).join('\n'));
  }
  console.log('\n=== sample slugs per skill ===');
  const seen = {};
  for (const r of data) {
    if (!seen[r.skill]) { seen[r.skill] = r.slug; }
  }
  console.log(seen);
}

async function dumpSlug(slug) {
  const { data, error } = await supabase
    .from('passages')
    .select(`slug, skill, module, status, source, difficulty,
      question_groups ( position, question_type, prompt,
        group_options ( option_key, display_text, position ),
        questions ( position, global_number, prompt_text,
          answer_keys ( accepted, correct_option_keys, spelling_variants, word_limit, normalize ) ) )`)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  console.log(`\n===== ${slug} =====`);
  console.log(JSON.stringify(data, null, 2));
}

await listTitles();
for (const s of slugs) await dumpSlug(s);
