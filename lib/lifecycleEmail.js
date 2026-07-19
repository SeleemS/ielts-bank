import { createHmac, timingSafeEqual } from 'node:crypto';

const SITE_URL = 'https://www.ielts-bank.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailSecret() {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    ''
  );
}

export function unsubscribeToken(email) {
  const secret = emailSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('hex');
}

export function validUnsubscribeToken(email, token) {
  const expected = unsubscribeToken(email);
  if (!expected || !/^[a-f0-9]{64}$/.test(String(token || ''))) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
}

function shell({ eyebrow, title, intro, body, ctaLabel, ctaHref, footer = '' }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f1f5f9;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px;">
            <p style="margin:0 0 8px;color:#047857;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
            <h1 style="margin:0;color:#0f172a;font-size:28px;line-height:1.2;">${escapeHtml(title)}</h1>
            <p style="margin:16px 0 0;color:#475569;font-size:16px;line-height:1.65;">${escapeHtml(intro)}</p>
            <div style="margin:22px 0;color:#334155;font-size:15px;line-height:1.65;">${body}</div>
            <a href="${escapeHtml(ctaHref)}" style="display:inline-block;border-radius:10px;background:#059669;color:#ffffff;padding:12px 18px;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
            ${footer ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;color:#64748b;font-size:12px;line-height:1.6;">${footer}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function weeklyFooter(email) {
  const token = unsubscribeToken(email);
  if (!token) return 'You received this because you subscribed to IELTS Bank practice updates.';
  const href = `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
  return `You received this because you subscribed to IELTS Bank practice updates. <a href="${href}" style="color:#475569;">Unsubscribe</a>.`;
}

export function renderLifecycleEmail(row) {
  const payload = row.payload || {};
  switch (row.email_type) {
    case 'welcome_signup':
      return {
        subject: 'Your free IELTS Writing sample is ready',
        html: shell({
          eyebrow: 'Welcome to IELTS Bank',
          title: 'Start with the essay you care about',
          intro: 'Your account includes one lifetime AI Writing sample score.',
          body:
            '<p>Paste a Task 1 or Task 2 response to see your overall band and first scoring criterion in full. Your result is saved to your dashboard.</p>',
          ctaLabel: 'Get my free Writing score',
          ctaHref: `${SITE_URL}/ielts-writing-checker`,
        }),
      };
    case 'welcome_purchase':
      return {
        subject: 'You’re in — your Premium first-day checklist',
        html: shell({
          eyebrow: 'IELTS Bank Premium',
          title: 'Do these three things first',
          intro: 'Turn your new access into useful feedback today.',
          body:
            '<ol><li>Score the essay you already wrote.</li><li>Meet the live AI examiner.</li><li>Sit one timed mock to find your weakest section.</li></ol>',
          ctaLabel: 'Open my dashboard',
          ctaHref: `${SITE_URL}/dashboard`,
          footer: payload.access_expires_at
            ? `Your Exam Pass is active until ${escapeHtml(new Date(payload.access_expires_at).toLocaleDateString('en-US', { timeZone: 'UTC' }))}.`
            : 'You can manage or cancel your subscription from Billing settings.',
        }),
      };
    case 'weekly_digest':
      return {
        subject: payload.subject || 'Your weekly IELTS practice plan',
        html: shell({
          eyebrow: payload.plan === 'premium' ? 'Premium weekly practice' : 'This week at IELTS Bank',
          title: payload.title || 'One focused session beats a week of vague studying',
          intro: payload.intro || 'Use this week’s guide, then complete one timed practice set.',
          body: payload.body_html || '<p>Choose the skill with the biggest gap and practise it under a real time limit.</p>',
          ctaLabel: payload.cta_label || 'Start this week’s practice',
          ctaHref: payload.cta_href || `${SITE_URL}/dashboard`,
          footer: weeklyFooter(row.recipient_email),
        }),
      };
    case 'win_back':
      return {
        subject: 'Retaking IELTS? Your practice history is still here',
        html: shell({
          eyebrow: 'Welcome back',
          title: 'Pick up where you left off',
          intro: 'Your saved scores and attempts are still on your dashboard.',
          body:
            '<p>If you are preparing for a retake, return for one month and get 40% off the Monthly plan. The offer is validated against your canceled account at checkout.</p>',
          ctaLabel: 'Return with 40% off',
          ctaHref: `${SITE_URL}/pricing?offer=winback`,
          footer: `Offer applies to eligible returning subscribers and cannot be combined with another discount.<br>${weeklyFooter(row.recipient_email)}`,
        }),
      };
    default:
      throw new Error(`unknown lifecycle email type: ${row.email_type}`);
  }
}

export async function sendLifecycleEmail(row) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'resend-not-configured' };
  const rendered = renderLifecycleEmail(row);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': row.idempotency_key,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.REPORT_FROM || 'IELTS Bank <hello@ielts-bank.com>',
      to: [row.recipient_email],
      subject: rendered.subject,
      html: rendered.html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      sent: false,
      reason: `resend-${response.status}: ${String(result?.message || '').slice(0, 180)}`,
    };
  }
  return { sent: true, providerId: result.id || null };
}
