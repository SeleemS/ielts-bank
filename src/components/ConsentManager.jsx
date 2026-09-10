import { useEffect } from 'react';
import { OPTIONAL_CONSENT_KEY, readOptionalConsent } from '../lib/consent';

// Synchronize existing privacy preferences without rendering a popup or
// recording a fabricated explicit choice in browser storage.
export default function ConsentManager({ onConsentChange }) {
  useEffect(() => {
    const sync = (event) => {
      if (event && event.key !== null && event.key !== OPTIONAL_CONSENT_KEY) return;
      if (event) window.__ieltsOptionalConsent = null;
      const choice = readOptionalConsent();
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: choice,
          ad_storage: choice,
          ad_user_data: choice,
          ad_personalization: choice,
          functionality_storage: 'granted',
          security_storage: 'granted',
        });
      }
      onConsentChange?.(choice);
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [onConsentChange]);
  return null;
}
