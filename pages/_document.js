import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        {/* Allow large image previews in Google Search / Discover. */}
        <meta name="robots" content="max-image-preview:large" />
        {/* Google Consent Mode defaults — must run before gtag.js/AdSense load.
            OPT-OUT model: optional storage defaults to GRANTED and stays on
            until the visitor explicitly opts out through ConsentManager, or the
            browser sends Global Privacy Control (always honored). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = window.gtag || gtag;
              (function(){
                var saved = null;
                try { saved = localStorage.getItem('ib_consent_v1'); } catch (e) {}
                var gpc = navigator.globalPrivacyControl === true;
                window.__ieltsOptionalConsent =
                  gpc ? 'denied' :
                  (saved === 'granted' || saved === 'denied' ? saved : null);
                var optional = (gpc || saved === 'denied') ? 'denied' : 'granted';
                gtag('consent', 'default', {
                  analytics_storage: optional, ad_storage: optional, ad_user_data: optional,
                  ad_personalization: optional, functionality_storage: 'granted',
                  security_storage: 'granted', wait_for_update: 500
                });
                gtag('set', 'ads_data_redaction', true);
                window.__ieltsConsentDefaulted = true;
              })();
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
