import React, { useEffect, useState } from 'react';
import NextLink from 'next/link';
import {
  readOptionalConsent,
  writeOptionalConsent,
} from '../lib/consent';

// Cookie-consent banner mirroring the denied-until-granted Google Consent Mode
// defaults set in pages/_document.js. Choice persists in localStorage and can
// be reopened any time via the floating "Privacy choices" button.

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
    const saved = readOptionalConsent();
    if (saved) updateConsent(saved); else setOpen(true);
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
            We use analytics to improve the site and advertising to keep practice free. You can
            accept or reject optional analytics and personalized-ad storage. Essential storage
            remains on.
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
