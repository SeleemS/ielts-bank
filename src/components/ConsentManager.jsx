import React, { useEffect, useState } from 'react';
import NextLink from 'next/link';
import {
  readOptionalConsent,
  writeOptionalConsent,
  consentDecided,
  optionalDefaultsOn,
} from '../lib/consent';

// Consent banner mirroring the geo-aware Google Consent Mode defaults set in
// pages/_document.js. In opt-out regions optional analytics/ads are ON by
// default and this discloses that + offers a one-click opt-out; in
// EU/EEA/UK/Switzerland or when geo is unavailable (opt-in), they are off until
// the visitor accepts. GPC is always honored.
// Choice persists in localStorage and the banner reopens via the floating
// "Privacy choices" button.

function updateConsent(choice) {
  const gtag = window.gtag;
  if (typeof gtag !== 'function') return;
  const optional = choice === 'granted' ? 'granted' : 'denied';
  gtag('consent', 'update', {
    analytics_storage: optional,
    ad_storage: optional,
    ad_user_data: optional,
    ad_personalization: optional,
    functionality_storage: 'granted',
    security_storage: 'granted',
  });
}

export default function ConsentManager({ onConsentChange }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Push the effective region-aware state into Consent Mode and show the
    // notice until the visitor has decided.
    updateConsent(readOptionalConsent());
    if (!consentDecided()) setOpen(true);
  }, []);
  const choose = (choice) => {
    const resolvedChoice = writeOptionalConsent(choice);
    updateConsent(resolvedChoice);
    onConsentChange?.(resolvedChoice);
    setOpen(false);
  };
  return (
    <>
      {open && (
        <aside
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-2xl"
          aria-label="Cookie consent"
          data-nosnippet
          data-analytics-popup="cookie_consent"
          data-analytics-label="Cookie consent"
        >
          <h2 className="font-bold text-foreground">Your privacy choices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {optionalDefaultsOn()
              ? 'We use analytics and advertising to improve the site and keep practice free — these are on by default. You can opt out of optional analytics and personalized-ad storage anytime. Essential storage always stays on.'
              : 'We’d like to use optional analytics and advertising to improve the site and keep practice free. They stay off until you accept — you can accept or reject below. Essential storage always stays on.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => choose('granted')}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Accept optional cookies
            </button>
            <button
              onClick={() => choose('denied')}
              className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground"
            >
              Reject optional cookies
            </button>
            <NextLink href="/privacypolicy" className="px-2 py-2.5 text-sm font-medium text-primary underline">
              Privacy policy
            </NextLink>
          </div>
        </aside>
      )}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-3 left-3 z-40 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow"
          data-nosnippet
          data-analytics-id="privacy_choices_open"
        >
          Privacy choices
        </button>
      )}
    </>
  );
}
