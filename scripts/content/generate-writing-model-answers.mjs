#!/usr/bin/env node
/**
 * Generate and persist one high-band sample answer and a short examiner
 * rationale for every published Writing task that does not already have one.
 * Idempotent and resumable: completed rows are skipped unless --force is used.
 *
 * Usage:
 *   node scripts/content/generate-writing-model-answers.mjs [--dry-run] [--force] [--limit=10]
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');
const limitArg = [...args].find((value) => value.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : Infinity;
const env = loadEnv();
const API_KEY = env.OPENAI_API_KEY;
const MODEL = env.OPENAI_CONTENT_MODEL || env.OPENAI_WRITING_MODEL || 'gpt-5.1';

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !API_KEY) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY are required.');
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function plain(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(html) {
  return plain(html).split(/\s+/).filter(Boolean).length;
}

function systemPrompt(task, module) {
  const kind = task === 2 ? 'IELTS Writing Task 2 essay' : module === 'general' ? 'IELTS General Training Task 1 letter' : 'IELTS Academic Writing Task 1 report';
  const range = task === 2 ? '270-330' : '180-220';
  return `You are a senior IELTS writing editor. Produce an original Band 8-9 ${kind} that directly answers the supplied prompt. The response must be ${range} words, natural rather than formulaic, coherent, accurate, and suitable as a teaching sample. For Academic Task 1, include a clear overview and compare only data actually supplied. For General letters, cover every bullet and use the requested register. For Task 2, maintain a precise position and develop specific examples. Do not mention being an AI. Return safe HTML using only <p>, <strong> and <em>. Also provide a 60-100 word examiner-style rationale explaining concrete strengths across the official criteria. Never claim an official examiner awarded a band.`;
}

async function generate(row, attempt = 1) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt(row.task, row.passages.module) },
        { role: 'user', content: `TITLE: ${row.passages.title}\nMODULE: ${row.passages.module}\nTASK: ${row.task}\nPROMPT:\n${plain(row.prompt_html)}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'writing_model_answer', strict: true,
          schema: {
            type: 'object', additionalProperties: false,
            properties: { answer_html: { type: 'string' }, rationale_html: { type: 'string' } },
            required: ['answer_html', 'rationale_html'],
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
  const answerWords = words(parsed.answer_html);
  const min = row.task === 2 ? 250 : 160;
  if ((!parsed.answer_html || !parsed.rationale_html || answerWords < min) && attempt < 3) return generate(row, attempt + 1);
  if (!parsed.answer_html || !parsed.rationale_html || answerWords < min) throw new Error(`invalid output (${answerWords} words)`);
  return parsed;
}

const { data, error } = await supabase
  .from('writing_details')
  .select('passage_id, task, prompt_html, model_answer_html, passages!inner(title, slug, module, status)')
  .eq('passages.status', 'published')
  .order('passage_id');
if (error) throw error;

const pending = data.filter((row) => FORCE || !row.model_answer_html).slice(0, LIMIT);
console.log(`[model-answers] ${pending.length} pending of ${data.length}; model=${MODEL}${DRY_RUN ? '; DRY RUN' : ''}`);

let cursor = 0;
let completed = 0;
let failed = 0;
async function worker() {
  while (cursor < pending.length) {
    const index = cursor++;
    const row = pending[index];
    const label = `${index + 1}/${pending.length} ${row.passages.slug}`;
    if (DRY_RUN) { console.log(`[model-answers] would generate ${label}`); continue; }
    try {
      const generated = await generate(row);
      const { error: updateError } = await supabase.from('writing_details').update({
        model_answer_html: generated.answer_html,
        model_answer_rationale_html: generated.rationale_html,
      }).eq('passage_id', row.passage_id);
      if (updateError) throw updateError;
      completed += 1;
      console.log(`[model-answers] saved ${label} (${words(generated.answer_html)} words)`);
    } catch (error) {
      failed += 1;
      console.error(`[model-answers] FAILED ${label}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(4, pending.length || 1) }, () => worker()));
console.log(`[model-answers] complete=${completed} failed=${failed}`);
if (failed) process.exitCode = 1;
