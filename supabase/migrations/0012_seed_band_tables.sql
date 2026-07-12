-- 0012_seed_band_tables.sql
-- Seed the band_tables / band_table_rows tables (created in 0003) with the
-- ESTIMATED, publicly-circulated raw-score -> IELTS band conversions used by the
-- /band-calculator page. These mirror lib/bandTables.js exactly.
--
-- Idempotent: band_tables has a UNIQUE (skill, module, name) constraint, so the
-- inserts use ON CONFLICT DO NOTHING. band_table_rows has no natural unique key,
-- so we only insert its rows when the parent table has no rows yet (guarding
-- against duplicate rows on re-run). Safe to run multiple times.
--
-- NOTE: these are estimates only. The official conversion is set per test
-- version by the test partners and is not published.

-- ---------------------------------------------------------------------------
-- Parent band_tables rows (one per conversion curve).
-- ---------------------------------------------------------------------------
insert into public.band_tables (skill, module, name, is_active) values
  ('listening', null,        'Listening (estimated)',                true),
  ('reading',   'academic',  'Academic Reading (estimated)',         true),
  ('reading',   'general',   'General Training Reading (estimated)', true)
on conflict (skill, module, name) do nothing;

-- ---------------------------------------------------------------------------
-- Listening rows.
-- ---------------------------------------------------------------------------
insert into public.band_table_rows (band_table_id, raw_min, raw_max, band)
select bt.id, v.raw_min, v.raw_max, v.band
from public.band_tables bt
cross join (values
  (39, 40, 9.0),
  (37, 38, 8.5),
  (35, 36, 8.0),
  (32, 34, 7.5),
  (30, 31, 7.0),
  (26, 29, 6.5),
  (23, 25, 6.0),
  (18, 22, 5.5),
  (16, 17, 5.0),
  (13, 15, 4.5),
  (10, 12, 4.0),
  (8,  9,  3.5),
  (6,  7,  3.0),
  (4,  5,  2.5),
  (3,  3,  2.0),
  (2,  2,  1.5),
  (1,  1,  1.0),
  (0,  0,  0.0)
) as v(raw_min, raw_max, band)
where bt.skill = 'listening' and bt.module is null
  and bt.name = 'Listening (estimated)'
  and not exists (
    select 1 from public.band_table_rows r where r.band_table_id = bt.id
  );

-- ---------------------------------------------------------------------------
-- Academic Reading rows.
-- ---------------------------------------------------------------------------
insert into public.band_table_rows (band_table_id, raw_min, raw_max, band)
select bt.id, v.raw_min, v.raw_max, v.band
from public.band_tables bt
cross join (values
  (39, 40, 9.0),
  (37, 38, 8.5),
  (35, 36, 8.0),
  (33, 34, 7.5),
  (30, 32, 7.0),
  (27, 29, 6.5),
  (23, 26, 6.0),
  (19, 22, 5.5),
  (15, 18, 5.0),
  (13, 14, 4.5),
  (10, 12, 4.0),
  (8,  9,  3.5),
  (6,  7,  3.0),
  (4,  5,  2.5),
  (3,  3,  2.0),
  (2,  2,  1.5),
  (1,  1,  1.0),
  (0,  0,  0.0)
) as v(raw_min, raw_max, band)
where bt.skill = 'reading' and bt.module = 'academic'
  and bt.name = 'Academic Reading (estimated)'
  and not exists (
    select 1 from public.band_table_rows r where r.band_table_id = bt.id
  );

-- ---------------------------------------------------------------------------
-- General Training Reading rows.
-- ---------------------------------------------------------------------------
insert into public.band_table_rows (band_table_id, raw_min, raw_max, band)
select bt.id, v.raw_min, v.raw_max, v.band
from public.band_tables bt
cross join (values
  (40, 40, 9.0),
  (39, 39, 8.5),
  (37, 38, 8.0),
  (36, 36, 7.5),
  (34, 35, 7.0),
  (32, 33, 6.5),
  (30, 31, 6.0),
  (27, 29, 5.5),
  (23, 26, 5.0),
  (19, 22, 4.5),
  (15, 18, 4.0),
  (12, 14, 3.5),
  (9,  11, 3.0),
  (6,  8,  2.5),
  (4,  5,  2.0),
  (2,  3,  1.5),
  (1,  1,  1.0),
  (0,  0,  0.0)
) as v(raw_min, raw_max, band)
where bt.skill = 'reading' and bt.module = 'general'
  and bt.name = 'General Training Reading (estimated)'
  and not exists (
    select 1 from public.band_table_rows r where r.band_table_id = bt.id
  );
