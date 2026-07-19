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
import { sessionStats, fmtDuration } from '../../../lib/sessionStats';

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

  const [signupsRes, totalUsersRes, eventsRes, attemptsRes, retentionRes] = await Promise.all([
    admin
      .from('users')
      .select('email, signup_country, signup_source, created_at')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at'),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin
      .from('activity_events')
      .select('event, anon_id, user_id, country, skill, props, session_id, occurred_at, created_at')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(50000),
    admin
      .from('attempts')
      .select('skill, user_id, per_question')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(10000),
    // New-vs-returning; SQL-side because it needs a full-history look-back
    // per visitor (see migration 20260719050000). Fail-soft: a missing RPC
    // must not kill the report.
    admin.rpc('returning_visitor_stats', { p_start: start, p_end: end }),
  ]);
  for (const res of [signupsRes, totalUsersRes, eventsRes, attemptsRes]) {
    if (res.error) throw res.error;
  }
  if (retentionRes.error) console.error('returning_visitor_stats failed:', retentionRes.error.message);
  const retentionRow = Array.isArray(retentionRes.data) ? retentionRes.data[0] : retentionRes.data;
  const retention = !retentionRes.error && retentionRow
    ? {
        visitors: Number(retentionRow.visitors) || 0,
        returning: Number(retentionRow.returning_visitors) || 0,
        new: Math.max((Number(retentionRow.visitors) || 0) - (Number(retentionRow.returning_visitors) || 0), 0),
      }
    : null;

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
      // Session durations from per-tab session_id + heartbeats; see
      // lib/sessionStats.js for the definition and its biases.
      sessions: sessionStats(events),
      // {visitors, returning, new} from full-history look-back, or null when
      // the RPC is unavailable.
      retention,
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

// Prior days from daily_reports, keyed by date, for deltas and the 7-day
// trend. Missing days (cron gaps, first week) render as em-dashes.
async function fetchHistory(admin, reportDate) {
  const start = new Date(Date.parse(`${reportDate}T00:00:00.000Z`) - 6 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('daily_reports')
    .select('report_date, data')
    .gte('report_date', start)
    .lt('report_date', reportDate)
    .order('report_date');
  if (error) {
    console.error('daily_reports history fetch failed:', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((row) => [row.report_date, row.data]));
}

// --- Email rendering -------------------------------------------------------
//
// Gmail iOS is the primary client, so: table layout, every style inline, no
// images/SVG (bars are colored table cells), and colors chosen to survive
// Gmail's dark-mode lightness inversion (midtones + near-white/near-black,
// deltas dual-encoded with text arrows so hue shifts can't erase meaning).
// The <style> block is progressive enhancement only — Gmail strips it for
// non-Google IMAP accounts and discards it entirely on any syntax error.

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  bg: '#eef1f6',
  card: '#fffffe',
  border: '#e3e8ef',
  navy: '#16304f',
  navyMuted: '#a8bcd6',
  accent: '#3f76c4',
  text: '#1c2a3a',
  muted: '#64748b',
  track: '#e9edf3',
  up: { bg: '#d9f2e4', fg: '#0f7b46' },
  down: { bg: '#fbe3e1', fg: '#b3261e' },
  flat: { bg: '#e9edf3', fg: '#64748b' },
  warn: '#9a5b00',
};

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n) {
  if (typeof n === 'string') return n; // preformatted values (e.g. durations)
  return (n ?? 0).toLocaleString('en-US');
}

function prettyDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function visitorsOf(report) {
  return report ? report.activity.activeSignedIn + report.activity.activeAnonymous : null;
}

// Delta vs the previous day: {dir, label} or null when there is no baseline.
function delta(cur, prev) {
  if (prev == null) return null;
  if (prev === 0 && cur === 0) return { dir: 'flat', label: '±0' };
  if (prev === 0) return { dir: 'up', label: `+${fmt(cur)}` };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { dir: 'flat', label: '±0%' };
  return { dir: pct > 0 ? 'up' : 'down', label: `${Math.abs(pct)}%` };
}

function chip(d) {
  if (!d) return '';
  const tone = C[d.dir];
  const arrow = d.dir === 'up' ? '&#9650; ' : d.dir === 'down' ? '&#9660; ' : '';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;background-color:${tone.bg};color:${tone.fg};">${arrow}${d.label}</span>`;
}

function spacer(h) {
  return `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`;
}

function card(inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-card" style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;"><tr><td style="padding:18px 20px;">${inner}</td></tr></table>${spacer(14)}`;
}

function sectionTitle(text) {
  return `<div class="em-muted" style="font-size:11px;letter-spacing:1.2px;font-weight:700;color:${C.muted};text-transform:uppercase;padding-bottom:12px;">${text}</div>`;
}

function tile(label, value, d, caption) {
  return `<div class="em-muted" style="font-size:11px;letter-spacing:1px;font-weight:700;color:${C.muted};text-transform:uppercase;">${label}</div>
    <div class="em-txt" style="font-size:28px;font-weight:700;color:${C.text};line-height:1.25;">${fmt(value)}</div>
    ${d ? `<div style="padding-top:2px;">${chip(d)}</div>` : ''}
    ${caption ? `<div class="em-muted" style="font-size:12px;color:${C.muted};padding-top:4px;">${caption}</div>` : ''}`;
}

function tileGrid(tiles) {
  const rows = [];
  for (let i = 0; i < tiles.length; i += 2) {
    rows.push(`<tr>
      <td width="50%" valign="top" style="padding:10px 8px 10px 0;">${tiles[i]}</td>
      <td width="50%" valign="top" style="padding:10px 0 10px 8px;">${tiles[i + 1] || ''}</td>
    </tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

// Horizontal bar: track td + fill div sized server-side. font-size/line-height
// 1px stops clients from inflating the row to text height.
function bar(pct, color = C.accent) {
  const width = Math.max(pct > 0 ? 4 : 0, Math.min(100, Math.round(pct)));
  return `<td class="em-track" style="background-color:${C.track};border-radius:4px;">
    ${width ? `<div style="background-color:${color};width:${width}%;height:8px;border-radius:4px;font-size:1px;line-height:1px;">&nbsp;</div>` : `<div style="height:8px;font-size:1px;line-height:1px;">&nbsp;</div>`}
  </td>`;
}

// Top-N list with proportional bars, capped at 5 rows + a "+N more" line.
function barList(title, counts) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return '';
  const top = entries.slice(0, 5);
  const max = Math.max(...top.map(([, v]) => v));
  const rows = top
    .map(([key, value]) => `<tr>
      <td class="em-txt" style="font-size:13px;color:${C.text};padding:5px 10px 5px 0;white-space:nowrap;" width="110">${esc(key.charAt(0).toUpperCase() + key.slice(1))}</td>
      ${bar((value / max) * 100)}
      <td class="em-txt" style="font-size:13px;font-weight:600;color:${C.text};padding:5px 0 5px 10px;text-align:right;" width="40">${fmt(value)}</td>
    </tr>`)
    .join('');
  const more = entries.length > 5
    ? `<div class="em-muted" style="font-size:12px;color:${C.muted};padding-top:6px;">+ ${entries.length - 5} more</div>`
    : '';
  return card(`${sectionTitle(title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${more}`);
}

function trendSection(report, history) {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    dates.push(new Date(Date.parse(`${report.date}T00:00:00Z`) - i * 864e5).toISOString().slice(0, 10));
  }
  const byDate = { ...history, [report.date]: report };
  const known = dates.map((d) => visitorsOf(byDate[d])).filter((v) => v != null);
  if (known.length < 2) return '';
  const max = Math.max(...known, 1);
  const rows = dates
    .map((date) => {
      const day = byDate[date];
      const visitors = visitorsOf(day);
      const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const isToday = date === report.date;
      return `<tr>
        <td class="em-muted" style="font-size:12px;color:${C.muted};padding:4px 10px 4px 0;${isToday ? 'font-weight:700;' : ''}" width="40">${label}</td>
        ${day ? bar((visitors / max) * 100, isToday ? C.accent : '#9db8dd') : bar(0)}
        <td class="em-txt" style="font-size:13px;color:${C.text};padding:4px 0 4px 10px;text-align:right;${isToday ? 'font-weight:700;' : ''}" width="36">${day ? fmt(visitors) : '&mdash;'}</td>
        <td class="em-muted" style="font-size:12px;color:${C.muted};padding:4px 0 4px 8px;text-align:right;" width="52">${day ? `${fmt(day.signups.count)} su` : ''}</td>
      </tr>`;
    })
    .join('');
  return card(`${sectionTitle('Last 7 days &mdash; visitors &middot; signups')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}

function funnelSection(report) {
  const visitors = visitorsOf(report);
  if (!visitors) return '';
  const stages = [
    { label: 'Visitors', value: visitors },
    { label: 'Signed up', value: report.signups.count },
    { label: 'Practiced', value: report.practice.usersPracticing },
  ];
  const rows = stages
    .map((stage, i) => {
      const conv = i === 0 ? '' : `${Math.round((stage.value / Math.max(stages[i - 1].value, 1)) * 100)}% of ${stages[i - 1].label.toLowerCase()}`;
      return `<tr>
        <td class="em-txt" style="font-size:13px;color:${C.text};padding:5px 10px 5px 0;" width="80">${stage.label}</td>
        ${bar((stage.value / visitors) * 100)}
        <td class="em-txt" style="font-size:13px;font-weight:600;color:${C.text};padding:5px 0 5px 10px;text-align:right;" width="30">${fmt(stage.value)}</td>
      </tr>
      ${conv ? `<tr><td></td><td class="em-muted" colspan="2" style="font-size:11px;color:${C.muted};padding:0 0 4px;">${conv}</td></tr>` : ''}`;
    })
    .join('');
  return card(`${sectionTitle('Funnel')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}

// Data-driven callouts so the report says "so what", not just counts.
function buildInsights(report, prev) {
  const { signups, activity, practice } = report;
  const visitors = visitorsOf(report);
  const insights = [];
  if (visitors > 0 && signups.count > 0) {
    insights.push({ tone: 'info', text: `${Math.round((signups.count / visitors) * 100)}% of visitors signed up (${signups.count}/${visitors}).` });
  }
  const attributed = Object.keys(signups.bySource || {}).filter((k) => k !== 'unknown');
  if (signups.count > 1 && !attributed.length) {
    insights.push({ tone: 'warn', text: `All ${signups.count} signups have unknown source &amp; country &mdash; signup attribution may be broken.` });
  }
  const scoredSkills = ['reading', 'listening', 'mock'];
  const scoredAttempts = Object.entries(practice.attemptsBySkill || {}).some(([k]) => scoredSkills.some((s) => k.includes(s)));
  if (practice.attempts > 0 && practice.questionsAnswered === 0 && scoredAttempts) {
    insights.push({ tone: 'warn', text: `${practice.attempts} practice attempts but 0 questions answered &mdash; check the answer-recording flow.` });
  }
  if (signups.count > 0 && practice.usersPracticing === 0) {
    insights.push({ tone: 'warn', text: 'None of yesterday&rsquo;s users practiced &mdash; activation gap after signup.' });
  }
  if (prev && activity.pageViews > 0) {
    const prevViews = prev.activity.pageViews;
    if (prevViews > 0 && activity.pageViews >= prevViews * 2) {
      insights.push({ tone: 'info', text: `Page views ${fmt(activity.pageViews)} more than doubled vs ${fmt(prevViews)} the day before.` });
    }
  }
  return insights;
}

function insightsSection(insights) {
  if (!insights.length) return '';
  const rows = insights
    .map((i) => `<tr>
      <td valign="top" style="font-size:13px;padding:4px 8px 4px 0;color:${i.tone === 'warn' ? C.warn : C.accent};font-weight:700;" width="14">${i.tone === 'warn' ? '&#9888;' : '&#8250;'}</td>
      <td class="em-txt" style="font-size:13px;color:${C.text};padding:4px 0;line-height:1.45;">${i.text}</td>
    </tr>`)
    .join('');
  return card(`${sectionTitle('Worth noting')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}

export function renderEmail(report, history = {}) {
  const { signups, activity, practice } = report;
  const visitors = visitorsOf(report);
  const prevDate = new Date(Date.parse(`${report.date}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const prev = history[prevDate] || null;
  const prevVisitors = visitorsOf(prev);
  const quiet = !visitors && !signups.count && !practice.attempts;

  const preheader = quiet
    ? 'Quiet day — no recorded activity.'
    : `${fmt(signups.count)} signups · ${fmt(visitors)} visitors · ${fmt(practice.attempts)} practice attempts`;

  const heroTiles = [
    tile('New signups', signups.count, delta(signups.count, prev ? prev.signups.count : null), `${fmt(signups.totalUsers)} users total`),
    tile('Visitors', visitors, delta(visitors, prevVisitors), `${fmt(activity.activeSignedIn)} signed in &middot; ${fmt(activity.activeAnonymous)} anonymous`),
  ];
  // Older daily_reports rows predate session tracking — guard both sides.
  const sessions = activity.sessions || null;
  const prevSessions = prev?.activity?.sessions || null;
  const kpiTiles = [
    tile('Practice attempts', practice.attempts, delta(practice.attempts, prev ? prev.practice.attempts : null)),
    tile('Questions answered', practice.questionsAnswered, delta(practice.questionsAnswered, prev ? prev.practice.questionsAnswered : null)),
    tile('Page views', activity.pageViews, delta(activity.pageViews, prev ? prev.activity.pageViews : null)),
    tile('Logins', activity.logins, delta(activity.logins, prev ? prev.activity.logins : null)),
    tile(
      'Avg session / visitor',
      fmtDuration(sessions?.perVisitorAvgSeconds),
      delta(sessions?.perVisitorAvgSeconds ?? 0, prevSessions?.perVisitorAvgSeconds ?? null),
      sessions?.count ? `median ${fmtDuration(sessions.medianSeconds)} per session` : 'no sessions recorded'
    ),
    tile('Sessions', sessions?.count ?? 0, delta(sessions?.count ?? 0, prevSessions ? prevSessions.count : null)),
  ];
  // New-vs-returning (null until the RPC/migration is live in a given env).
  const retention = activity.retention || null;
  const prevRetention = prev?.activity?.retention || null;
  if (retention) {
    kpiTiles.push(
      tile(
        'Returning visitors',
        retention.returning,
        delta(retention.returning, prevRetention ? prevRetention.returning : null),
        retention.visitors ? `${Math.round((retention.returning / retention.visitors) * 100)}% of visitors` : ''
      ),
      tile('New visitors', retention.new, delta(retention.new, prevRetention ? prevRetention.new : null))
    );
  }

  const body = quiet
    ? card(`<div class="em-txt" style="font-size:15px;color:${C.text};line-height:1.5;">Quiet day &mdash; no visits, signups, or practice recorded.</div>`)
    : [
        card(`${tileGrid(heroTiles)}${prev ? `<div class="em-muted" style="font-size:11px;color:${C.muted};padding-top:2px;">Changes vs ${prettyDate(prevDate)}</div>` : ''}`),
        insightsSection(buildInsights(report, prev)),
        card(tileGrid(kpiTiles)),
        trendSection(report, history),
        funnelSection(report),
        barList('Visitors by country', activity.visitorsByCountry),
        signups.count ? barList('Signups by source', signups.bySource) : '',
        signups.count ? barList('Signups by country', signups.byCountry) : '',
        barList('Attempts by skill', practice.attemptsBySkill),
        barList('Questions by type', practice.questionsByType),
        signups.emails.length
          ? card(`${sectionTitle('New signups')}${signups.emails
              .map((email) => `<div class="em-txt" style="font-size:13px;color:${C.text};padding:3px 0;">${esc(email)}</div>`)
              .join('')}`)
          : '',
      ].join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .em-body { background-color: #131313 !important; }
  .em-card { background-color: #1e1f22 !important; border-color: #33363c !important; }
  .em-txt { color: #f0f2f5 !important; }
  .em-muted { color: #9aa4b2 !important; }
  .em-track { background-color: #33363c !important; }
}
[data-ogsc] .em-txt { color: #f0f2f5 !important; }
[data-ogsb] .em-card { background-color: #1e1f22 !important; }
</style>
</head>
<body class="em-body" style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-body" style="background-color:${C.bg};"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:${FONT};">
<tr><td style="background-color:${C.navy};border-radius:12px;padding:18px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:17px;font-weight:700;color:#fffffe;">IELTS Bank</td>
    <td style="font-size:12px;color:${C.navyMuted};text-align:right;">Daily report</td>
  </tr></table>
  <div style="font-size:13px;color:${C.navyMuted};padding-top:2px;">${prettyDate(report.date)} &middot; UTC</div>
</td></tr>
<tr><td>${spacer(14)}${body}
<div class="em-muted" style="font-size:12px;color:${C.muted};text-align:center;padding:8px 0 20px;">
  <a href="https://www.ielts-bank.com" style="color:${C.accent};text-decoration:none;font-weight:600;">ielts-bank.com</a>
  &nbsp;&middot;&nbsp; Automated daily report
</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function subjectLine(report, history) {
  const visitors = visitorsOf(report);
  const prevDate = new Date(Date.parse(`${report.date}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const prev = history[prevDate] || null;
  const part = (value, d) => (d && d.dir !== 'flat' ? `${fmt(value)} (${d.dir === 'up' ? '+' : '-'}${d.label.replace('+', '')})` : fmt(value));
  const signupsPart = part(report.signups.count, delta(report.signups.count, prev ? prev.signups.count : null));
  const visitorsPart = part(visitors, delta(visitors, visitorsOf(prev)));
  return `IELTS Bank ${prettyDate(report.date)}: ${signupsPart} signups, ${visitorsPart} visitors`;
}

async function sendEmail(report, history) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_EMAIL;
  if (!apiKey || !to) return { sent: false, reason: 'email-not-configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.REPORT_FROM || 'IELTS Bank <hello@ielts-bank.com>',
      to: [to],
      subject: subjectLine(report, history),
      html: renderEmail(report, history),
    }),
  });
  if (!response.ok) return { sent: false, reason: `resend-${response.status}` };
  return { sent: true };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
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
    const [report, history] = await Promise.all([
      buildReport(admin, reportDate),
      fetchHistory(admin, reportDate),
    ]);
    const { error: upsertError } = await admin
      .from('daily_reports')
      .upsert({ report_date: reportDate, data: report }, { onConflict: 'report_date' });
    if (upsertError) throw upsertError;
    const email = await sendEmail(report, history);
    return res.status(200).json({ ok: true, email, report });
  } catch (error) {
    console.error('daily report failed:', error.message);
    return res.status(503).json({ error: 'Report generation failed.' });
  }
}
