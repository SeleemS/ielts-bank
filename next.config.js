/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------
// Inventory of every external origin the app actually loads (see pages/_app.js,
// pages/_document.js, lib/supabase.js, pages/api/score/*):
//   * Next.js runtime            -> 'self' + inline bootstrap ('unsafe-inline')
//   * Google AdSense             -> pagead2.googlesyndication.com and the wider
//                                   googlesyndication / doubleclick /
//                                   googletagservices / adtrafficquality set
//                                   (script, frame, img, connect)
//   * Google Analytics (gtag)    -> googletagmanager.com + google-analytics.com,
//                                   both DIRECT and via the first-party /gt proxy
//                                   ('self' covers the proxied path)
//   * Vercel Analytics/Speed     -> va.vercel-scripts.com (script),
//                                   vitals.vercel-insights.com (connect)
//   * Supabase                   -> the project origin, in connect-src (data +
//                                   auth) AND media-src (audio from Storage)
//   * MediaRecorder playback     -> blob: in media-src and worker-src
//
// 'unsafe-eval' is added ONLY in development (React Fast Refresh / Next dev
// tooling needs it); production script-src does not include it.
const SUPABASE_ORIGIN = 'https://nnqbagvknskqyrxkbyct.supabase.co';
const isDev = process.env.NODE_ENV !== 'production';

const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Next.js inline runtime + inline gtag-init in _app.js
    ...(isDev ? ["'unsafe-eval'"] : []),
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://www.googletagservices.com',
    'https://adservice.google.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://ssl.google-analytics.com',
    'https://va.vercel-scripts.com',
  ],
  'script-src-elem': [
    "'self'",
    "'unsafe-inline'",
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://www.googletagservices.com',
    'https://adservice.google.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://ssl.google-analytics.com',
    'https://va.vercel-scripts.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:', // AdSense/analytics pull tracking pixels + creatives from many hosts
  ],
  'font-src': ["'self'", 'data:'],
  'media-src': [
    "'self'",
    'blob:', // MediaRecorder recording playback
    'data:',
    SUPABASE_ORIGIN, // listening/speaking audio from Supabase Storage
  ],
  'worker-src': ["'self'", 'blob:'],
  'connect-src': [
    "'self'",
    SUPABASE_ORIGIN,
    'https://api.openai.com', // Realtime examiner: SDP exchange + ephemeral session (speaking-examiner)
    'https://vitals.vercel-insights.com',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com',
    'https://www.googletagmanager.com',
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://*.adtrafficquality.google',
  ],
  'frame-src': [
    "'self'",
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://tpc.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://www.google.com',
    'https://*.adtrafficquality.google',
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'upgrade-insecure-requests': [],
  'report-uri': ['/api/csp-report'],
  'report-to': ['csp-endpoint'],
};

function buildCsp(directives) {
  return Object.entries(directives)
    .map(([key, values]) =>
      values.length ? `${key} ${values.join(' ')}` : key
    )
    .join('; ');
}

const CSP = buildCsp(cspDirectives);

// Enforced headers applied to every route. Violations are reported to the
// same-origin endpoint so policy regressions are observable in server logs.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // Speaking practice uses MediaRecorder -> same-origin microphone MUST stay
    // allowed. Camera and geolocation are fully disabled.
    value: 'camera=(), geolocation=(), microphone=(self)',
  },
  { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
  { key: 'Content-Security-Policy', value: CSP },
];

// Blog posts merged into the hub they duplicated (lib/blogMerges.js).
const BLOG_MERGES = require('./lib/blogMerges.json');

// Affiliate programs (lib/affiliates.js) are inert until the founder sets
// AFFILIATE_URL_<ID>. Client placements can't read server env vars, so bake the
// list of CONFIGURED program ids — never the URLs — into the bundle. Same
// naming convention as affiliateEnvVar()/affiliateIdFromEnvVar(); lib/affiliates
// intersects this list with its registry, so an unknown id here is ignored.
const AFFILIATE_PROGRAMS_ENABLED = Object.keys(process.env)
  .filter((key) => /^AFFILIATE_URL_[A-Z0-9_]+$/.test(key))
  .filter((key) => /^https:\/\/\S+$/.test(String(process.env[key] || '').trim()))
  .map((key) => key.slice('AFFILIATE_URL_'.length).toLowerCase().replace(/_/g, '-'))
  .sort()
  .join(',');

const nextConfig = {
  reactStrictMode: true,
  env: {
    AFFILIATE_PROGRAMS_ENABLED,
  },
  // lib/posts.js reads content/posts/*.md with fs.readdirSync. Next's tracer
  // cannot follow a dynamic directory read, so the two routes that load posts
  // at REQUEST time (rather than only at build time) would ship without the
  // markdown files and throw ENOENT on Vercel. The blog pages are SSG and bake
  // their content in at build, so they need no entry here.
  //
  // lib/essays.js reads content/essays/*.md the same way. The essay pages are
  // fully static, but the essay-bank hub and the writing question pages are
  // ISR (their getStaticProps re-runs on Vercel) and the sitemap runs per
  // request, so all three need the essay files traced in.
  outputFileTracingIncludes: {
    // The sitemap index builds every section (for per-section lastmod) and
    // each child sitemap imports the same loader, so all of them read posts.
    '/sitemap.xml': ['./content/posts/**', './content/essays/**'],
    '/sitemap-guides.xml': ['./content/posts/**', './content/essays/**'],
    '/sitemap-blog.xml': ['./content/posts/**', './content/essays/**'],
    '/sitemap-reading.xml': ['./content/posts/**', './content/essays/**'],
    '/sitemap-writing.xml': ['./content/posts/**', './content/essays/**'],
    '/sitemap-listening.xml': ['./content/posts/**', './content/essays/**'],
    '/sitemap-speaking.xml': ['./content/posts/**', './content/essays/**'],
    '/api/cron/lifecycle-emails': ['./content/posts/**'],
    '/ielts-essay-bank': ['./content/essays/**'],
    '/writingquestion/**': ['./content/essays/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Static brand assets change only when the files themselves are
        // replaced in a deploy, so let browsers keep them for a year.
        source: '/:asset(favicon.ico|image.png|logo192.png|logo512.png)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The two essay-bank blog guides were merged into the IELTS Essay Bank
      // hub (their method now lives in its "How to use" section), so their
      // ranking signals consolidate on the page searchers actually want.
      {
        source: '/blog/ielts-essay-bank-guide',
        destination: '/ielts-essay-bank',
        permanent: true,
      },
      {
        source: '/blog/ielts-writing-bank-tips',
        destination: '/ielts-essay-bank',
        permanent: true,
      },
      // /index served a duplicate of the home page (canonicalised, but still a
      // crawlable second URL).
      { source: '/index', destination: '/', permanent: true },
      // The month-grouped "new cue cards" page was reshaped into the seasonal
      // cue-card hub (every card by topic family, newest first).
      { source: '/speaking/new-cue-cards', destination: '/ielts-speaking-cue-cards', permanent: true },
      ...Object.entries(BLOG_MERGES).map(([slug, destination]) => ({
        source: `/blog/${slug}`,
        destination,
        permanent: true,
      })),
    ];
  },
  async rewrites() {
    return [
      // First-party proxy for Google Analytics so ad blockers that block
      // googletagmanager.com / analytics.google.com don't drop hits.
      {
        source: '/gt/js',
        destination: 'https://www.googletagmanager.com/gtag/js',
      },
      {
        source: '/gt/g/collect',
        destination: 'https://analytics.google.com/g/collect',
      },
    ];
  },
};

module.exports = nextConfig;
