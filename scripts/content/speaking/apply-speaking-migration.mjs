#!/usr/bin/env node
/**
 * apply-speaking-migration.mjs
 * ----------------------------
 * Applies supabase/migrations/0010_speaking_content.sql to the live DB over the
 * Postgres session pooler (SUPABASE_DB_SESSION_URL), then verifies the new
 * `part1_questions` column exists on public.speaking_details.
 *
 *   node scripts/content/speaking/apply-speaking-migration.mjs
 *
 * (Requires the `pg` package: it is loaded lazily; install with
 *  `npm install pg --no-save` if missing.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

async function main() {
  loadEnvLocal();
  const { default: pg } = await import('pg');
  const connectionString = process.env.SUPABASE_DB_SESSION_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_SESSION_URL missing');

  const sql = readFileSync(
    path.join(ROOT, 'supabase/migrations/0010_speaking_content.sql'),
    'utf8'
  );

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('connected to db');

  await client.query(sql);
  console.log('migration 0010 applied');

  const r = await client.query(
    `select column_name, data_type from information_schema.columns
     where table_schema='public' and table_name='speaking_details'
     order by ordinal_position`
  );
  console.log('speaking_details columns:', r.rows.map((x) => `${x.column_name}:${x.data_type}`).join(', '));
  const ok = r.rows.some((x) => x.column_name === 'part1_questions' && x.data_type === 'jsonb');
  console.log(ok ? 'PASS: part1_questions jsonb present' : 'FAIL: part1_questions missing');

  await client.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
