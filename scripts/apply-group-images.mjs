// scripts/apply-group-images.mjs
// 1. Applies supabase/migrations/0009_group_image.sql (adds question_groups.image_svg).
// 2. Sets image_svg on the 5 map-labelling matching_information groups so the
//    listening map/plan questions show a real SVG map above the options.
//
//   node scripts/apply-group-images.mjs
//
// Idempotent: the ALTER is `add column if not exists`, and each UPDATE overwrites
// with the same SVG. Grading, options and answer keys are never touched.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

// ---- shared SVG helpers ---------------------------------------------------
const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
const open = (label) =>
  `<svg viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" ` +
  `style="display:block;width:100%;height:auto;max-width:640px;margin:0 auto">` +
  `<rect width="640" height="420" fill="#ffffff"/>`;
const close = '</svg>';
const title = (t) =>
  `<text x="22" y="30" font-family="${FONT}" font-size="16" font-weight="700" fill="#0A2540">${t}</text>`;
const note =
  `<text x="624" y="410" font-family="${FONT}" font-size="11" font-style="italic" fill="#64748b" text-anchor="end">Not to scale</text>`;
// slate road
const road = (x1, y1, x2, y2, w = 22) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="${w}" stroke-linecap="round"/>`;
// slate italic reference label (streets / fixed landmarks only — never a question place)
const ref = (x, y, t, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="12" font-style="italic" fill="#475569" text-anchor="${anchor}">${t}</text>`;
// emerald lettered marker A–F
const M = (x, y, l) =>
  `<circle cx="${x}" cy="${y}" r="14" fill="#059669" stroke="#ffffff" stroke-width="2"/>` +
  `<text x="${x}" y="${y + 5}" font-family="${FONT}" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">${l}</text>`;
// slate room / area box
const box = (x, y, w, h, fill = '#f1f5f9') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="#94a3b8" stroke-width="2"/>`;
// emerald entrance/start chevron pointing up, with label
const entrance = (x, y, label, lx, ly, anchor = 'start') =>
  `<path d="M${x - 9},${y} l9,-14 l9,14 z" fill="#059669"/>` +
  `<text x="${lx}" y="${ly}" font-family="${FONT}" font-size="12" font-weight="700" fill="#059669" text-anchor="${anchor}">${label}</text>`;
// north compass
const compass = (x, y) =>
  `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 24}" stroke="#0A2540" stroke-width="2"/>` +
  `<path d="M${x - 5},${y - 18} L${x},${y - 28} L${x + 5},${y - 18} Z" fill="#0A2540"/>` +
  `<text x="${x}" y="${y + 15}" font-family="${FONT}" font-size="12" font-weight="700" fill="#0A2540" text-anchor="middle">N</text>`;
// first-floor inset (indigo dashed callout)
const inset = (x, y, w, h, label) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#eef2ff" stroke="#6366f1" stroke-width="2" stroke-dasharray="5 4"/>` +
  `<text x="${x + 12}" y="${y + 20}" font-family="${FONT}" font-size="12" font-weight="700" fill="#4338ca">${label}</text>`;

// ---- 1. Ashcombe Old Town (town map) --------------------------------------
const townMap =
  open('Town map of Ashcombe Old Town') +
  title('Ashcombe Old Town — walking route') +
  // river along the top
  `<rect x="0" y="58" width="640" height="30" fill="#bae6fd"/>` +
  ref(16, 52, 'River') +
  // (no bridge glyph: the Packhorse Bridge is itself a question place — drawing
  // an obvious river crossing next to marker E would give the answer away)
  // roads
  road(320, 88, 320, 210) + // Mill Street (river down to Church Lane junction)
  road(320, 210, 320, 350) + // High Street (junction down to the square)
  road(92, 210, 320, 210, 20) + // Church Lane (west)
  // Market Square (fixed start reference) with the old stone cross
  box(250, 306, 140, 92, '#e2e8f0') +
  // stone cross above marker F so both stay visible
  `<path d="M320,332 v20 M310,342 h20" stroke="#64748b" stroke-width="3"/>` +
  ref(320, 326, 'Market Square', 'middle') + // inside the square, above the cross
  // street / feature labels (navigation aids from the audio)
  ref(332, 150, 'Mill Street') +
  ref(308, 286, 'High Street', 'end') + // west of the road, clear of marker A
  ref(118, 200, 'Church Lane') +
  compass(600, 66) +
  // tour starts IN the square — chevron just inside its south edge
  entrance(266, 392, 'START', 266, 412, 'middle') +
  // lettered positions
  M(357, 296, 'A') + // right as you enter the High St
  M(150, 264, 'B') + // set back, left of Church Lane
  M(150, 156, 'C') + // right of Church Lane, opposite the church
  M(296, 112, 'D') + // bottom of Mill St, on the riverbank
  M(242, 112, 'E') + // next to the mill, SAME side of Mill St as D
  M(320, 372, 'F') + // middle of the Market Square, below the cross
  note +
  close;

// ---- 2. Summer Food Festival (festival map) -------------------------------
const festivalMap =
  open('Map of the Summer Food Festival field') +
  title('Greenfield Summer Food Festival') +
  // the festival field
  box(70, 96, 500, 250, '#f7fee7') +
  ref(84, 114, 'Festival field') +
  // hedge along the left edge
  `<line x1="78" y1="102" x2="78" y2="340" stroke="#059669" stroke-width="4" stroke-dasharray="2 6"/>` +
  ref(84, 300, 'hedge') +
  // big oak tree on the right
  `<circle cx="512" cy="150" r="16" fill="#bbf7d0" stroke="#059669" stroke-width="2"/>` +
  `<line x1="512" y1="166" x2="512" y2="182" stroke="#65651e" stroke-width="3"/>` +
  ref(488, 154, 'oak tree', 'end') + // left of the tree, clear of markers C and D
  // main gate at the bottom of the field
  `<rect x="290" y="340" width="60" height="12" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>` +
  compass(600, 66) +
  entrance(320, 380, 'MAIN GATE', 320, 402, 'middle') +
  // lettered positions
  M(320, 152, 'A') + // straight ahead from the gate — Food Market
  M(122, 152, 'B') + // left of the Food Market, along the hedge
  M(492, 196, 'C') + // right, near the oak tree
  M(545, 114, 'D') + // far corner, behind the demo kitchen — clear of the canopy
  M(320, 240, 'E') + // centre of the field
  M(372, 316, 'F') + // just inside the main gate, on the right
  note +
  close;

// ---- 3. Community Garden (garden plan) ------------------------------------
const gardenMap =
  open('Plan of the community garden') +
  title('Bridgeton Community Garden') +
  // garden boundary
  box(70, 90, 500, 255, '#f0fdf4') +
  // fence along the left
  `<line x1="78" y1="96" x2="78" y2="338" stroke="#059669" stroke-width="4" stroke-dasharray="2 6"/>` +
  ref(84, 250, 'fence') +
  // pond tucked in the far corner (fixed landmark, not a question)
  `<ellipse cx="102" cy="112" rx="20" ry="13" fill="#bae6fd" stroke="#38bdf8" stroke-width="2"/>` +
  ref(102, 144, 'pond', 'middle') + // below the pond, clear of marker D
  // Canal Street along the bottom, with the entrance gate
  road(70, 372, 570, 372, 16) +
  ref(560, 392, 'Canal Street', 'end') +
  `<rect x="290" y="340" width="60" height="12" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>` +
  compass(600, 66) +
  entrance(320, 366, 'GATE', 320, 336, 'middle') +
  // lettered positions
  M(320, 214, 'A') + // straight ahead — main lawn
  M(128, 190, 'B') + // left of the lawn, hugging the fence — veg beds
  M(505, 214, 'C') + // right of the lawn, sunny corner — meadow
  M(150, 122, 'D') + // far end, beyond the veg beds — orchard
  M(515, 132, 'E') + // far right, next to the meadow — greenhouse
  M(248, 318, 'F') + // right by the gate, on the left — tool shed / compost
  note +
  close;

// ---- 4. City Museum (museum plan) -----------------------------------------
const museumMap =
  open('Plan of the City Museum') +
  title('City Museum — visitor plan') +
  // first-floor inset (up the main staircase)
  inset(72, 44, 236, 58, 'First floor (up the stairs)') +
  M(266, 74, 'C') + // Natural History Gallery, first floor
  // ground floor building
  box(80, 116, 480, 244, '#f8fafc') +
  ref(546, 134, 'Ground floor', 'end') + // top-right, clear of the stairs link line
  // courtyard garden the cafe overlooks (fixed landmark)
  `<rect x="484" y="250" width="60" height="60" rx="4" fill="#dcfce7" stroke="#059669" stroke-width="2"/>` +
  ref(514, 324, 'courtyard', 'middle') + // below the box — too wide to fit inside
  // main staircase on the left, with a dashed link up to the inset
  `<rect x="96" y="228" width="46" height="60" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>` +
  `<line x1="96" y1="240" x2="142" y2="240" stroke="#94a3b8" stroke-width="1.5"/>` +
  `<line x1="96" y1="252" x2="142" y2="252" stroke="#94a3b8" stroke-width="1.5"/>` +
  `<line x1="96" y1="264" x2="142" y2="264" stroke="#94a3b8" stroke-width="1.5"/>` +
  `<line x1="96" y1="276" x2="142" y2="276" stroke="#94a3b8" stroke-width="1.5"/>` +
  ref(119, 306, 'stairs', 'middle') +
  `<line x1="119" y1="226" x2="119" y2="106" stroke="#6366f1" stroke-width="2" stroke-dasharray="5 4"/>` +
  `<path d="M114,112 l5,-9 l5,9 z" fill="#6366f1"/>` +
  // entrance / exit / info desk at the front
  `<rect x="256" y="354" width="52" height="10" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>` +
  `<rect x="176" y="354" width="44" height="10" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>` +
  entrance(282, 386, 'ENTRANCE', 282, 402, 'middle') +
  ref(198, 400, 'exit', 'middle') +
  `<rect x="300" y="320" width="40" height="16" rx="3" fill="#d1fae5" stroke="#059669" stroke-width="2"/>` +
  ref(320, 315, 'info desk', 'middle') +
  // lettered positions
  M(396, 330, 'A') + // immediately right of the entrance — cloakroom
  M(320, 156, 'B') + // straight ahead, far end — Egyptian Gallery
  M(150, 156, 'D') + // corner, left of the Egyptian Gallery — Coins & Medals
  M(500, 210, 'E') + // right, past the cloakroom — cafe
  M(214, 330, 'F') + // next to the exit — gift shop
  note +
  close;

// ---- 5. Oakvale Leisure Centre (floor plan) -------------------------------
const leisureMap =
  open('Floor plan of the leisure centre') +
  title('Oakvale Leisure Centre — floor plan') +
  // first-floor inset (studios, above the gym)
  inset(340, 44, 230, 52, 'First floor (up the stairs)') +
  M(542, 72, 'E') + // studios, first floor — right of the inset label
  // ground floor building
  box(80, 108, 490, 252, '#f8fafc') +
  ref(94, 126, 'Ground floor') +
  // swimming pools (light blue rooms — fixed structure)
  `<rect x="92" y="142" width="150" height="94" rx="4" fill="#bae6fd" stroke="#38bdf8" stroke-width="2"/>` +
  `<rect x="92" y="142" width="70" height="46" rx="4" fill="#7dd3fc" stroke="#38bdf8" stroke-width="2"/>` +
  // gym block on the right + stairs up to the studios
  `<rect x="452" y="150" width="96" height="120" rx="4" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>` +
  `<rect x="486" y="150" width="30" height="40" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/>` +
  `<line x1="486" y1="160" x2="516" y2="160" stroke="#94a3b8" stroke-width="1.2"/>` +
  `<line x1="486" y1="170" x2="516" y2="170" stroke="#94a3b8" stroke-width="1.2"/>` +
  `<line x1="486" y1="180" x2="516" y2="180" stroke="#94a3b8" stroke-width="1.2"/>` +
  ref(501, 205, 'stairs', 'middle') +
  `<line x1="501" y1="148" x2="465" y2="98" stroke="#6366f1" stroke-width="2" stroke-dasharray="5 4"/>` +
  `<path d="M460,104 l5,-9 l6,8 z" fill="#6366f1"/>` +
  // reception + main doors at the front
  `<rect x="286" y="316" width="68" height="20" rx="3" fill="#d1fae5" stroke="#059669" stroke-width="2"/>` +
  ref(320, 330, 'Reception', 'middle') +
  `<rect x="292" y="354" width="56" height="10" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>` +
  entrance(320, 386, 'MAIN DOORS', 320, 402, 'middle') +
  // lettered positions
  M(320, 232, 'A') + // directly behind reception — changing rooms
  M(180, 210, 'B') + // big room, left of the changing rooms — main pool
  M(126, 165, 'C') + // small room, far left corner — children's pool
  M(500, 226, 'D') + // right-hand side — fitness suite / gym
  M(430, 330, 'F') + // by the entrance, opposite reception — cafe
  note +
  close;

const MAPS = {
  'a-walking-tour-of-ashcombe-old-town-14toca': townMap,
  'announcements-at-the-summer-food-festival-xibrtt': festivalMap,
  'community-garden-open-day-welcome-th5glc': gardenMap,
  'orientation-tour-of-the-city-museum-1pprzq': museumMap,
  'tour-of-the-new-leisure-centre-1gr7dc': leisureMap,
};

// --dump <dir>: write the 5 SVGs (plus a review.html contact sheet) to <dir>
// for visual review instead of touching the database.
function dump(dir) {
  mkdirSync(dir, { recursive: true });
  let html = '<meta charset="utf-8"><body style="font-family:system-ui;background:#f8fafc;margin:24px">';
  for (const [slug, svg] of Object.entries(MAPS)) {
    writeFileSync(path.join(dir, `${slug}.svg`), svg);
    html += `<h3>${slug}</h3><div style="max-width:660px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:10px;margin-bottom:28px">${svg}</div>`;
  }
  writeFileSync(path.join(dir, 'review.html'), html);
  console.log(`wrote ${Object.keys(MAPS).length} SVGs + review.html to ${dir}`);
}

async function main() {
  const dumpIdx = process.argv.indexOf('--dump');
  if (dumpIdx !== -1) {
    dump(process.argv[dumpIdx + 1] || path.join(ROOT, 'svg-review'));
    return;
  }
  // pg is only needed for the DB path — imported lazily so --dump works
  // without it installed.
  const { default: pg } = await import('pg');
  loadEnvLocal();
  const connectionString = process.env.SUPABASE_DB_SESSION_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_SESSION_URL missing');

  const sql = readFileSync(
    path.join(ROOT, 'supabase/migrations/0009_group_image.sql'),
    'utf8'
  );

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('connected to db');

  await client.query(sql);
  console.log('migration 0009 applied (question_groups.image_svg present)');

  for (const [slug, svg] of Object.entries(MAPS)) {
    const res = await client.query(
      `update public.question_groups qg
         set image_svg = $1
        from public.passages p
       where qg.passage_id = p.id
         and p.slug = $2
         and qg.question_type = 'matching_information'
       returning qg.id`,
      [svg, slug]
    );
    console.log(
      `  ${slug}: updated ${res.rowCount} group(s), svg ${svg.length} bytes`
    );
    if (res.rowCount !== 1) {
      console.warn(`  WARN: expected exactly 1 matching_information group for ${slug}`);
    }
  }

  // Verify grading-relevant columns are untouched: confirm option + question
  // counts for each map group are unchanged (A–F options, 5 questions each).
  const check = await client.query(
    `select p.slug,
            (select count(*) from public.group_options go where go.question_group_id = qg.id) as opts,
            (select count(*) from public.questions q where q.question_group_id = qg.id) as qs,
            length(qg.image_svg) as svg_len
       from public.question_groups qg
       join public.passages p on p.id = qg.passage_id
      where p.slug = any($1) and qg.question_type = 'matching_information'
      order by p.slug`,
    [Object.keys(MAPS)]
  );
  console.log('\nverification (slug | options | questions | svg bytes):');
  for (const r of check.rows) {
    console.log(`  ${r.slug} | ${r.opts} | ${r.qs} | ${r.svg_len}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
