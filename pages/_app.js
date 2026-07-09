import { ChakraProvider } from '@chakra-ui/react';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import '../src/index.css';

const GA_MEASUREMENT_ID = 'G-1KRYZZY68X';
const ADSENSE_CLIENT = 'ca-pub-5189362957619937';

function MyApp({ Component, pageProps }) {
  return (
    <ChakraProvider>
      {/* Google AdSense */}
      <Script
        id="adsbygoogle-init"
        strategy="afterInteractive"
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
      />

      {/* Google Analytics 4 (gtag.js) */}
      <Script
        id="gtag-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>

      <Component {...pageProps} />
      <Analytics />
    </ChakraProvider>
  );
}

export default MyApp;
