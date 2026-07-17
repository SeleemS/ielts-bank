export const config = { runtime: 'nodejs' };

// Daily analytics report. Runs via Vercel cron (see vercel.json), guarded by
// CRON_SECRET like /api/cron/cleanup. Aggregates the previous UTC day from
// public.users / activity_events / attempts, stores the result in
// daily_reports, and emails it via Resend when RESEND_API_KEY + REPORT_EMAIL
// are configured (the table is the system of record; email is best-effort).
//
// Manual run / backfill: GET /api/cron/daily-report?date=2026-07-16 with the
// same bearer secret.

import { createClient } from '@supabase/supabase-js';

function countBy(rows, pick) {
  const counts = {};
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

async function buildReport(admin, reportDate) {
  const start = `${reportDate}T00:00:00.000Z`;
  const end = new Date(Date.parse(start) + 864e5).toISOString();

  const [signupsRes, totalUsersRes, eventsRes, attemptsRes] = await Promise.all([
    admin
      .from('users')
      .select('email, signup_country, signup_source, created_at')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at'),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin
      .from('activity_events')
      .select('event, anon_id, user_id, country, skill, props')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(50000),
    admin
      .from('attempts')
      .select('skill, user_id, per_question')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(10000),
  ]);
  for (const res of [signupsRes, totalUsersRes, eventsRes, attemptsRes]) {
    if (res.error) throw res.error;
  }

  const signups = signupsRes.data || [];
  const events = eventsRes.data || [];
  const attempts = attemptsRes.data || [];

  const signedInIds = new Set(events.filter((e) => e.user_id).map((e) => e.user_id));
  const anonIds = new Set(events.filter((e) => !e.user_id).map((e) => e.anon_id));

  // One country/source per visitor (first seen), so these counts are
  // visitors, not raw event volume.
  const visitorCountry = new Map();
  const visitorSource = new Map();
  for (const e of events) {
    const visitor = e.user_id || e.anon_id;
    if (e.country && !visitorCountry.has(visitor)) visitorCountry.set(visitor, e.country);
    const source = e.props && e.props.source;
    if (source && !visitorSource.has(visitor)) visitorSource.set(visitor, source);
  }

  // Questions answered by question type, from per_question jsonb on attempts
  // (covers reading/listening/mocks; writing & speaking are whole-task skills).
  const questionsByType = {};
  let questionsAnswered = 0;
  for (const attempt of attempts) {
    const perQuestion = attempt.per_question && typeof attempt.per_question === 'object' ? Object.values(attempt.per_question) : [];
    for (const q of perQuestion) {
      const type = (q && typeof q === 'object' && q.questionType) || 'unknown';
      questionsByType[type] = (questionsByType[type] || 0) + 1;
      questionsAnswered += 1;
    }
  }

  return {
    date: reportDate,
    signups: {
      count: signups.length,
      totalUsers: totalUsersRes.count ?? null,
      byCountry: countBy(signups, (s) => s.signup_country || 'unknown'),
      bySource: countBy(signups, (s) => s.signup_source || 'unknown'),
      emails: signups.map((s) => s.email).filter(Boolean),
    },
    activity: {
      events: events.length,
      activeSignedIn: signedInIds.size,
      activeAnonymous: anonIds.size,
      logins: events.filter((e) => e.event === 'login').length,
      pageViews: events.filter((e) => e.event === 'page_view').length,
      visitorsByCountry: countBy([...visitorCountry.values()], (c) => c),
      visitorsBySource: countBy([...visitorSource.values()], (s) => s),
      byEvent: countBy(events, (e) => e.event),
    },
    practice: {
      attempts: attempts.length,
      usersPracticing: new Set(attempts.map((a) => a.user_id)).size,
      attemptsBySkill: countBy(attempts, (a) => a.skill || 'unknown'),
      questionsAnswered,
      questionsByType: Object.fromEntries(Object.entries(questionsByType).sort((a, b) => b[1] - a[1])),
    },
  };
}

function renderTable(title, counts) {
  const rows = Object.entries(counts || {});
  if (!rows.length) return '';
  return `<h3 style="margin:16px 0 4px;font-size:14px">${title}</h3>
    <table style="border-collapse:collapse;font-size:13px">${rows
      .map(([key, value]) => `<tr><td style="padding:2px 16px 2px 0">${key}</td><td style="text-align:right">${value}</td></tr>`)
      .join('')}</table>`;
}

function renderEmail(report) {
  const { signups, activity, practice } = report;
  return `<div style="font-family:system-ui,sans-serif;color:#111;max-width:560px">
    <h2 style="font-size:18px">ielts-bank.com — ${report.date}</h2>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:2px 16px 2px 0">New signups</td><td style="text-align:right"><b>${signups.count}</b></td></tr>
      <tr><td style="padding:2px 16px 2px 0">Total users</td><td style="text-align:right">${signups.totalUsers ?? '—'}</td></tr>
      <tr><td style="padding:2px 16px 2px 0">Active signed-in users</td><td style="text-align:right"><b>${activity.activeSignedIn}</b></td></tr>
      <tr><td style="padding:2px 16px 2px 0">Anonymous visitors</td><td style="text-align:right">${activity.activeAnonymous}</td></tr>
      <tr><td style="padding:2px 16px 2px 0">Logins</td><td style="text-align:right">${activity.logins}</td></tr>
      <tr><td style="padding:2px 16px 2px 0">Page views</td><td style="text-align:right">${activity.pageViews}</td></tr>
      <tr><td style="padding:2px 16px 2px 0">Practice attempts</td><td style="text-align:right"><b>${practice.attempts}</b></td></tr>
      <tr><td style="padding:2px 16px 2px 0">Questions answered</td><td style="text-align:right">${practice.questionsAnswered}</td></tr>
    </table>
    ${renderTable('Signups by country', signups.byCountry)}
    ${renderTable('Signups by source', signups.bySource)}
    ${renderTable('Visitors by country', activity.visitorsByCountry)}
    ${renderTable('Attempts by skill', practice.attemptsBySkill)}
    ${renderTable('Questions by type', practice.questionsByType)}
    ${signups.emails.length ? `<h3 style="margin:16px 0 4px;font-size:14px">New signups</h3><p style="font-size:13px">${signups.emails.join('<br>')}</p>` : ''}
  </div>`;
}

async function sendEmail(report) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_EMAIL;
  if (!apiKey || !to) return { sent: false, reason: 'email-not-configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || 'IELTS Bank <onboarding@resend.dev>',
      to: [to],
      subject: `IELTS Bank daily report — ${report.date}: ${report.signups.count} signups, ${report.activity.activeSignedIn + report.activity.activeAnonymous} visitors`,
      html: renderEmail(report),
    }),
  });
  if (!response.ok) return { sent: false, reason: `resend-${response.status}` };
  return { sent: true };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Report is not configured.' });
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Default: yesterday (UTC). ?date=YYYY-MM-DD overrides for backfills.
  const override = typeof req.query.date === 'string' ? req.query.date : '';
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(override)
    ? override
    : new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  try {
    const report = await buildReport(admin, reportDate);
    const { error: upsertError } = await admin
      .from('daily_reports')
      .upsert({ report_date: reportDate, data: report }, { onConflict: 'report_date' });
    if (upsertError) console.error('daily_reports upsert failed:', upsertError.message);
    const email = await sendEmail(report);
    return res.status(200).json({ ok: true, email, report });
  } catch (error) {
    console.error('daily report failed:', error.message);
    return res.status(503).json({ error: 'Report generation failed.' });
  }
}
