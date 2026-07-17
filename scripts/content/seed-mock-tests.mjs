#!/usr/bin/env node
/**
 * Seed five full mock tests from existing published content:
 *   - three Academic Reading mocks, three passages each (60 minutes)
 *   - two Listening mocks, four parts each (40 minutes)
 *
 * Idempotent: mock tests upsert by slug and their sections are replaced.
 * Usage:
 *   node --import ./scripts/_wspreload.mjs scripts/content/seed-mock-tests.mjs
 */
import { loadEnv } from './_env.mjs';

function questionCount(row) {
  return (row.question_groups || []).reduce(
    (total, group) => total + (group.questions || []).length,
    0
  );
}

function combinationsWithTotal(rows, size, target, start = 0, picked = []) {
  if (picked.length === size) {
    return picked.reduce((sum, row) => sum + questionCount(row), 0) === target ? [picked] : [];
  }
  const matches = [];
  for (let index = start; index <= rows.length - (size - picked.length); index += 1) {
    const next = [...picked, rows[index]];
    const total = next.reduce((sum, row) => sum + questionCount(row), 0);
    if (total > target) continue;
    matches.push(...combinationsWithTotal(rows, size, target, index + 1, next));
    // A small deterministic candidate set is enough to find disjoint groups
    // while avoiding an expensive enumeration across the full content bank.
    if (matches.length >= 100) break;
  }
  return matches;
}

function exactMockGroups(rows, groupCount, groupSize, target = 40) {
  function choose(remaining, groups) {
    if (groups.length === groupCount) return groups;
    for (const combination of combinationsWithTotal(remaining, groupSize, target)) {
      const used = new Set(combination.map((row) => row.id));
      const result = choose(remaining.filter((row) => !used.has(row.id)), [...groups, combination]);
      if (result) return result;
    }
    return null;
  }
  const groups = choose(rows, []);
  if (!groups) throw new Error(`Could not compose ${groupCount} disjoint ${target}-question mocks.`);
  return groups;
}

async function publishedCandidates(supabase, skill, module = null) {
  let query = supabase
    .from('passages')
    .select('id, slug, title, question_groups(questions(id))')
    .eq('skill', skill)
    .eq('status', 'published')
    .order('slug', { ascending: true });
  if (module) query = query.eq('module', module);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((row) => questionCount(row) > 0);
}

async function upsertMock(supabase, definition) {
  const { data: mock, error } = await supabase
    .from('mock_tests')
    .upsert(
      {
        slug: definition.slug,
        title: definition.title,
        module: definition.module,
        description: definition.description,
        status: 'published',
      },
      { onConflict: 'slug' }
    )
    .select('id')
    .single();
  if (error) throw error;

  const { error: deleteError } = await supabase
    .from('mock_test_sections')
    .delete()
    .eq('mock_test_id', mock.id);
  if (deleteError) throw deleteError;

  const sections = definition.passages.map((passage, position) => ({
    mock_test_id: mock.id,
    passage_id: passage.id,
    skill: definition.skill,
    position,
    time_limit_seconds: definition.sectionSeconds,
  }));
  const { error: sectionError } = await supabase.from('mock_test_sections').insert(sections);
  if (sectionError) throw sectionError;

  console.log(
    `[seed-mocks] ${definition.slug}: ${sections.length} sections, ${definition.passages.reduce(
      (sum, row) => sum + questionCount(row),
      0
    )} questions`
  );
}

async function main() {
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const reading = (await publishedCandidates(supabase, 'reading', 'academic')).filter(
    (row) => questionCount(row) >= 12 && questionCount(row) <= 14
  );
  const listening = (await publishedCandidates(supabase, 'listening')).filter(
    (row) => questionCount(row) >= 8
  );
  if (reading.length < 9 || listening.length < 8) {
    throw new Error(`Not enough content: reading=${reading.length}, listening=${listening.length}`);
  }
  const readingGroups = exactMockGroups(reading, 3, 3);
  const listeningGroups = exactMockGroups(listening, 2, 4);

  const definitions = [
    ...Array.from({ length: 3 }, (_, index) => ({
      slug: `academic-reading-mock-${index + 1}`,
      title: `Academic Reading Mock Test ${index + 1}`,
      module: 'academic',
      skill: 'reading',
      description: 'A full 60-minute IELTS Academic Reading mock with three passages and an estimated band score.',
      sectionSeconds: 20 * 60,
      passages: readingGroups[index],
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      slug: `listening-mock-${index + 1}`,
      title: `Listening Mock Test ${index + 1}`,
      module: null,
      skill: 'listening',
      description: 'A full four-part IELTS Listening mock with authentic-style audio and an estimated band score.',
      sectionSeconds: 10 * 60,
      passages: listeningGroups[index],
    })),
  ];

  for (const definition of definitions) await upsertMock(supabase, definition);
}

main().catch((error) => {
  console.error('[seed-mocks] fatal:', error.message);
  process.exit(1);
});
