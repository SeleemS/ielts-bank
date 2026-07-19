export const ADSENSE_CLIENT = 'ca-pub-5189362957619937';
export const ADSENSE_SCRIPT_BASE =
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

export function adsenseScriptUrl(client = ADSENSE_CLIENT) {
  return `${ADSENSE_SCRIPT_BASE}?client=${encodeURIComponent(client)}`;
}

export function syncAdSenseScript(document, enabled, client = ADSENSE_CLIENT) {
  const selector = `script[src^="${ADSENSE_SCRIPT_BASE}"]`;
  const existing = document.querySelector(selector);

  if (!enabled) {
    existing?.remove();
    return null;
  }
  if (existing) return existing;

  const script = document.createElement('script');
  script.setAttribute('async', '');
  script.src = adsenseScriptUrl(client);
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  return script;
}
