export const config = { api: { bodyParser: { sizeLimit: '16kb' } }, runtime: 'nodejs' };

function parseBody(value) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function cleanReportText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeReportUrl(value) {
  const raw = cleanReportText(value, 2000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}${parsed.pathname}`.slice(0, 500);
    }
    return parsed.protocol.slice(0, 500);
  } catch {
    return raw.replace(/[?#].*$/, '').slice(0, 500);
  }
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const payload = parseBody(req.body);
  const envelope = Array.isArray(payload) ? payload[0] || {} : payload;
  const report = envelope['csp-report'] || envelope.body || envelope;
  const safe = {
    blocked: safeReportUrl(report['blocked-uri'] || report.blockedURL),
    directive: cleanReportText(
      report['violated-directive'] || report.effectiveDirective,
      120
    ),
    document: safeReportUrl(report['document-uri'] || report.documentURL),
    disposition: cleanReportText(report.disposition, 40),
  };
  console.warn('csp-violation', safe);
  return res.status(204).end();
}
