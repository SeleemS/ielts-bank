// Domain-aware grouping. A bare regex `t.co` also matches chatgpt.com.
export function acquisitionGroup(value) {
  if (value == null || value === '') return 'missing';
  const raw = String(value).trim().toLowerCase();
  if (['search', 'direct', 'social', 'referral', 'email', 'paid', 'unknown', 'ai_referral'].includes(raw)) return raw;
  let host;
  try { host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, ''); }
  catch { return 'other'; }
  const matches = domains => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  if (matches(['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'gemini.google.com', 'claude.ai', 'copilot.microsoft.com']) || ['chatgpt', 'openai', 'perplexity', 'gemini', 'claude'].includes(raw)) return 'ai_referral';
  if (matches(['facebook.com', 'instagram.com', 'tiktok.com', 'reddit.com', 't.co', 'twitter.com', 'x.com']) || ['facebook', 'instagram', 'tiktok', 'reddit'].includes(raw)) return 'social';
  if (matches(['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com', 'baidu.com']) || /^(google|bing|yahoo|duckduckgo|yandex|baidu)$/.test(raw) || /(^|\.)google\.(co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(host)) return 'search';
  return 'other';
}

export function summarizeAcquisition(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = acquisitionGroup(row.source);
    if (!groups.has(name)) groups.set(name, new Set());
    groups.get(name).add(row.identity);
  }
  return [...groups].map(([source, ids]) => ({ source, recordedIdentities: ids.size }))
    .sort((a, b) => b.recordedIdentities - a.recordedIdentities);
}
