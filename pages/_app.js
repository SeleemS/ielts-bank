import Script from 'next/script';
import Head from 'next/head';
import * as React from 'react';
import { useRouter } from 'next/router';
import { Analytics } from '@vercel/analytics/react';
// Tailwind + shadcn design tokens. Chakra has been fully removed; Tailwind
// Preflight is re-enabled in tailwind.config.js.
import '../src/styles/globals.css';
import { inter } from '../src/lib/fonts';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { trackPageView } from '../src/lib/analytics';
import ConsentManager from '../src/components/ConsentManager';

const GA_MEASUREMENT_ID = 'G-1KRYZZY68X';
const ADSENSE_CLIENT = 'ca-pub-5189362957619937';

function AppTelemetry({ router }) {
  const { user, loading } = useAuth();
  const initialPageTracked = React.useRef(false);
  React.useEffect(() => {
    const onRoute = (url) => trackPageView(url, Boolean(user?.id));
    router.events.on('routeChangeComplete', onRoute);
    return () => router.events.off('routeChangeComplete', onRoute);
  }, [router.events, user?.id]);
  React.useEffect(() => {
    if (!router.isReady || loading || initialPageTracked.current) return;
    initialPageTracked.current = true;
    const timer = window.setTimeout(() => trackPageView(router.asPath, Boolean(user?.id)), 500);
    return () => window.clearTimeout(timer);
  }, [loading, router.asPath, router.isReady, user?.id]);
  return null;
}

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [adsOnPublicHost, setAdsOnPublicHost] = React.useState(false);
  const adsAllowed = !/^\/(?:dashboard|auth|band-estimator|ielts-writing-checker|mock(?:\/|$)|(?:reading|writing|listening|speaking)question\/)/.test(router.asPath);
  React.useEffect(() => {
    setAdsOnPublicHost(/(^|\.)ielts-bank\.com$/i.test(window.location.hostname));
  }, []);
  return (
    <AuthProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      {/* Inter must live on <html>, not just the wrapper div below: modals and
          drawers render in portals attached to <body>, which otherwise fall
          back to the browser serif font. */}
      <style jsx global>{`
        html {
          font-family: ${inter.style.fontFamily}, ui-sans-serif, system-ui, sans-serif;
        }
      `}</style>
      <AppTelemetry router={router} />
      <div className={`${inter.variable} font-sans`}>
      {/* Google AdSense */}
      {adsAllowed && adsOnPublicHost ? <Script
          id="adsbygoogle-init"
          strategy="afterInteractive"
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
        /> : null}

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
            first_party_collection: true,
            send_page_view: false
          });
        `}
      </Script>

        <Component {...pageProps} />
        <ConsentManager />
        <Analytics />
      </div>
    </AuthProvider>
  );
}

export default MyApp;
