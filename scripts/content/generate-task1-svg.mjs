#!/usr/bin/env node
/**
 * Author inline, accessible SVG visuals for published Academic Task 1 prompts
 * that currently describe a chart, map or process but do not render one.
 * Resumable: rows already containing an <svg> are skipped.
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';

const env = loadEnv();
const API_KEY = env.OPENAI_API_KEY;
const MODEL = env.OPENAI_CONTENT_MODEL || env.OPENAI_WRITING_MODEL || 'gpt-5.1';
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !API_KEY) throw new Error('Missing required credentials.');
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function text(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function valid(svg) {
  return /^<svg[\s>]/i.test(svg.trim()) && /<\/svg>\s*$/i.test(svg.trim()) && !/<script|foreignObject|\son\w+=|javascript:/i.test(svg);
}
async function generate(row) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Create a self-contained inline SVG that accurately visualises the supplied IELTS Academic Task 1 prompt. Use every stated category, year, stage and numeric value; do not invent data. For maps and processes, clearly label locations or stages and show direction or order. Return a professional exam-style visual with viewBox="0 0 800 480", role="img", aria-labelledby, <title> and <desc>. Use only: svg, title, desc, g, rect, line, path, polyline, polygon, circle, ellipse, text and tspan. No scripts, style elements, foreignObject, event handlers, images, animations or external references. Put colors directly in fill and stroke attributes and keep labels legible.' },
        { role: 'user', content: `TITLE: ${row.passages.title}\nFULL PROMPT AND DATA:\n${text(row.prompt_html)}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'task1_svg', strict: true, schema: { type: 'object', additionalProperties: false, properties: { svg: { type: 'string' } }, required: ['svg'] } } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const body = await response.json();
  const svg = JSON.parse(body?.choices?.[0]?.message?.content || '{}').svg || '';
  if (!valid(svg)) throw new Error('unsafe or invalid SVG returned');
  return svg.trim();
}

const { data, error } = await supabase.from('writing_details')
  .select('passage_id, prompt_html, passages!inner(title, slug, module, status)')
  .eq('task', 1).eq('passages.module', 'academic').eq('passages.status', 'published');
if (error) throw error;
const pending = data.filter((row) => !/<svg[\s>]/i.test(row.prompt_html || ''));
console.log(`[task1-svg] ${pending.length} pending of ${data.length}; model=${MODEL}`);
let cursor = 0; let complete = 0; let failed = 0;
async function worker() {
  while (cursor < pending.length) {
    const index = cursor++; const row = pending[index];
    try {
      const svg = await generate(row);
      const promptHtml = `${svg}\n${row.prompt_html}`;
      const { error: updateError } = await supabase.from('writing_details').update({ prompt_html: promptHtml }).eq('passage_id', row.passage_id);
      if (updateError) throw updateError;
      complete += 1; console.log(`[task1-svg] saved ${index + 1}/${pending.length} ${row.passages.slug}`);
    } catch (error) {
      failed += 1; console.error(`[task1-svg] FAILED ${row.passages.slug}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(4, pending.length || 1) }, () => worker()));
console.log(`[task1-svg] complete=${complete} failed=${failed}`);
if (failed) process.exitCode = 1;
