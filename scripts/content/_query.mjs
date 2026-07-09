#!/usr/bin/env node
// Ad-hoc read helper for authoring: list existing titles (service role) and
// verify read-back through the anon-key legacy adapter. Not part of the import
// pipeline; safe read-only utility.
import { loadEnv } from './_env.mjs';

const mode = process.argv[2] || 'titles';
const env = loadEnv();
const { createClient } = await import('@supabase/supabase-js');

if (mode === 'titles') {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('passages')
    .select('skill, module, title, status')
    .order('skill', { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  const by = {};
  for (const r of data) {
    const k = `${r.skill}/${r.module}`;
    (by[k] ||= []).push(r.title);
  }
  for (const k of Object.keys(by).sort()) {
    console.log(`\n== ${k} (${by[k].length}) ==`);
    by[k].sort().forEach((t) => console.log('  ' + t));
  }
  console.log(`\nTOTAL: ${data.length}`);
}
