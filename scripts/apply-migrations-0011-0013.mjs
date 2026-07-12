#!/usr/bin/env node
/**
 * apply-migrations-0011-0013.mjs
 * ------------------------------
 * Applies supabase/migrations/0011_contact_messages.sql,
 * 0012_seed_band_tables.sql and 0013_newsletter.sql to the live DB over the
 * Postgres session pooler (SUPABASE_DB_SESSION_URL), then verifies each:
 *   0011 -> public.contact_messages exists with RLS enabled
 *   0012 -> public.band_tables / band_table_rows contain seeded rows
 *   0013 -> public.newsletter_subscribers exists with RLS enabled
 *
 *   node scripts/apply-migrations-0011-0013.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

const MIGRATIONS = [
  'supabase/migrations/0011_contact_messages.sql',
  'supabase/migrations/0012_seed_band_tables.sql',
  'supabase/migrations/0013_newsletter.sql',
];

async function main() {
  loadEnvLocal();
  const { default: pg } = await import('pg');
  const connectionString = process.env.SUPABASE_DB_SESSION_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_SESSION_URL missing');

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('connected to db');

  for (const rel of MIGRATIONS) {
    const sql = readFileSync(path.join(ROOT, rel), 'utf8');
    await client.query(sql);
    console.log(`applied ${rel}`);
  }

  const rls = await client.query(
    `select relname, relrowsecurity from pg_class
     where relname in ('contact_messages','newsletter_subscribers')`
  );
  for (const row of rls.rows) {
    console.log(`${row.relname}: rls=${row.relrowsecurity ? 'ENABLED' : 'DISABLED'}`);
  }
  const okRls =
    rls.rows.length === 2 && rls.rows.every((r) => r.relrowsecurity === true);

  const bands = await client.query(
    `select (select count(*) from public.band_tables) as tables,
            (select count(*) from public.band_table_rows) as rows`
  );
  console.log(
    `band_tables: ${bands.rows[0].tables} tables, ${bands.rows[0].rows} rows seeded`
  );
  const okBands = Number(bands.rows[0].tables) >= 3 && Number(bands.rows[0].rows) > 0;

  await client.end();
  console.log(okRls && okBands ? 'PASS: all three migrations verified' : 'FAIL: see above');
  if (!(okRls && okBands)) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
