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
            GEO-AWARE: EU/EEA/UK/Switzerland visitors default to DENIED
            (opt-in), other known countries default to GRANTED (opt-out), and a
            missing/invalid region cookie fails closed to DENIED. The region
            default comes from the `ib_consent_default` cookie set per request
            by middleware.js. Global Privacy Control and an explicit saved
            choice always override it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = window.gtag || gtag;
              (function(){
                function readCookie(name){
                  try {
                    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
                    return m ? decodeURIComponent(m[1]) : null;
                  } catch (e) { return null; }
                }
                var regionDefault = readCookie('ib_consent_default');
                regionDefault = (regionDefault === 'granted' || regionDefault === 'denied') ? regionDefault : 'denied';
                window.__ieltsConsentDefault = regionDefault;
                var saved = null;
                try { saved = localStorage.getItem('ib_consent_v1'); } catch (e) {}
                var gpc = navigator.globalPrivacyControl === true;
                window.__ieltsOptionalConsent =
                  gpc ? 'denied' :
                  (saved === 'granted' || saved === 'denied' ? saved : null);
                var optional =
                  gpc ? 'denied' :
                  saved === 'granted' ? 'granted' :
                  saved === 'denied' ? 'denied' :
                  regionDefault;
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
