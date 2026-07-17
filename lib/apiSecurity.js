const PRODUCTION_ORIGINS = new Set([
  'https://ielts-bank.com',
  'https://www.ielts-bank.com',
]);

const DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3005',
  'http://localhost:3025',
]);

function allowedOrigins() {
  if (process.env.NODE_ENV === 'production') return PRODUCTION_ORIGINS;
  return new Set([...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS]);
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function clientIp(req) {
  for (const value of [
    req.headers['x-vercel-forwarded-for'],
    req.headers['x-real-ip'],
  ]) {
    const candidate = firstHeader(value);
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.split(',')[0].trim();
    }
  }

  const forwarded = firstHeader(req.headers['x-forwarded-for']);
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}

export function originAllowed(req) {
  const origin = firstHeader(req.headers.origin);
  const referer = firstHeader(req.headers.referer);
  if (!origin && !referer) return process.env.NODE_ENV !== 'production';

  let candidate = origin;
  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      return false;
    }
  }

  return allowedOrigins().has(candidate);
}
