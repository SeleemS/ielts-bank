import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';
const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const qt of ['multiple_choice', 'short_answer', 'yes_no_notgiven']) {
  const { data, error } = await supabase
    .from('question_groups')
    .select(`question_type, prompt,
      group_options ( option_key, display_text, position ),
      questions ( prompt_text, answer_keys ( accepted, correct_option_keys, word_limit, normalize ) )`)
    .eq('question_type', qt)
    .limit(1);
  if (error) { console.log(qt, 'ERR', error.message); continue; }
  console.log(`\n===== ${qt} =====`);
  console.log(JSON.stringify(data?.[0], null, 2));
}
