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
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
