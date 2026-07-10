#!/usr/bin/env node
/**
 * verify-speaking.mjs
 * -------------------
 * End-to-end verifier for the speaking content bank:
 *   (a) counts PUBLISHED speaking passages grouped by speaking_details.part;
 *   (b) reads back a sample of items per part and asserts the jsonb shape
 *       (part1_questions / cue_card / part3_followups) + audioPaths are present;
 *   (c) fetches every referenced audioPath's public URL for the sample and
 *       asserts HTTP 200 / audio/mpeg / non-trivial size.
 *
 *   node scripts/content/speaking/verify-speaking.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const BUCKET = 'listening-audio';
const log = (...a) => console.log('[verify-speaking]', ...a);

function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function collectAudioPaths(part, sd) {
  if (part === 1) return (sd.part1_questions?.questions || []).map((q) => q.audioPath);
  if (part === 2) {
    const cc = sd.cue_card || {};
    return [cc.audioPath, ...(cc.roundOff || []).map((r) => r.audioPath)].filter(Boolean);
  }
  if (part === 3) return (sd.part3_followups?.questions || []).map((q) => q.audioPath);
  return [];
}

async function main() {
  const env = loadEnv();
  const h = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY };
  const rest = async (q) => {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${q}`, { headers: h });
    if (!r.ok) throw new Error(`${q} -> ${r.status}: ${await r.text()}`);
    return r.json();
  };

  // (a) counts by part
  const rows = await rest(
    'passages?skill=eq.speaking&status=eq.published&select=id,title,slug,speaking_details(part)'
  );
  const byPart = { 1: 0, 2: 0, 3: 0, other: 0 };
  for (const r of rows) {
    const p = r.speaking_details?.part;
    if (p === 1 || p === 2 || p === 3) byPart[p] += 1;
    else byPart.other += 1;
  }
  log(`(a) published speaking passages: total=${rows.length}  part1=${byPart[1]}  part2=${byPart[2]}  part3=${byPart[3]}  other=${byPart.other}`);

  // (b)+(c) sample one per part, assert shapes + audio resolves
  const pick = (p) => rows.find((r) => r.speaking_details?.part === p);
  const samples = [pick(1), pick(2), pick(3)].filter(Boolean);
  let allOk = true;
  for (const s of samples) {
    const full = (await rest(`speaking_details?passage_id=eq.${s.id}&select=part,part1_questions,cue_card,part3_followups`))[0];
    const part = full.part;
    const paths = collectAudioPaths(part, full);
    let shapeOk = false;
    if (part === 1) shapeOk = !!full.part1_questions?.topic && paths.length >= 4;
    if (part === 2) shapeOk = !!full.cue_card?.topic && Array.isArray(full.cue_card?.bullets) && !!full.cue_card?.audioPath && full.cue_card?.prepSeconds === 60;
    if (part === 3) shapeOk = !!full.part3_followups?.theme && paths.length >= 5;

    let audioOk = true;
    const audioResults = [];
    for (const p of paths) {
      const url = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;
      const a = await fetch(url);
      const ct = a.headers.get('content-type') || '';
      const size = (await a.arrayBuffer()).byteLength;
      const ok = a.status === 200 && ct.includes('audio/mpeg') && size > 5000;
      audioResults.push({ p, status: a.status, ct, size, ok });
      if (!ok) audioOk = false;
    }
    const ok = shapeOk && audioOk;
    allOk = allOk && ok;
    log(`(b/c) ${ok ? 'PASS' : 'FAIL'}  part${part}  "${s.title}"`);
    log(`       shape=${shapeOk ? 'OK' : 'BAD'}  audioClips=${paths.length} allResolve=${audioOk}`);
    log(`       e.g. ${audioResults[0]?.status} ${audioResults[0]?.ct} ${audioResults[0]?.size}b  ${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${audioResults[0]?.p}`);
  }

  log(allOk && rows.length === 50 ? 'VERIFY: ALL PASS' : 'VERIFY: see above');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('[verify-speaking] fatal:', e.message);
  process.exit(1);
});
