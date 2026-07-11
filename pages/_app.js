import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
// Tailwind + shadcn design tokens. Chakra has been fully removed; Tailwind
// Preflight is re-enabled in tailwind.config.js.
import '../src/styles/globals.css';
import { inter } from '../src/lib/fonts';
import { AuthProvider } from '../src/lib/auth';

const GA_MEASUREMENT_ID = 'G-1KRYZZY68X';
const ADSENSE_CLIENT = 'ca-pub-5189362957619937';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <div className={`${inter.variable} font-sans`}>
      {/* Google AdSense */}
      <Script
        id="adsbygoogle-init"
        strategy="afterInteractive"
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
      />

      {/* Google Analytics 4 (gtag.js), proxied first-party via /gt rewrites
          in next.config.js so ad blockers don't drop the script or hits */}
      <Script
        id="gtag-src"
        strategy="afterInteractive"
        src={`/gt/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            transport_url: window.location.origin + '/gt',
            first_party_collection: true
          });
        `}
      </Script>

        <Component {...pageProps} />
        <Analytics />
      </div>
    </AuthProvider>
  );
}

export default MyApp;
