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

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const payload = parseBody(req.body);
  const envelope = Array.isArray(payload) ? payload[0] || {} : payload;
  const report = envelope['csp-report'] || envelope.body || envelope;
  const safe = {
    blocked: String(report['blocked-uri'] || report.blockedURL || '').slice(0, 500),
    directive: String(report['violated-directive'] || report.effectiveDirective || '').slice(0, 120),
    document: String(report['document-uri'] || report.documentURL || '').slice(0, 500),
    disposition: String(report.disposition || '').slice(0, 40),
  };
  console.warn('csp-violation', safe);
  return res.status(204).end();
}
