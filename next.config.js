/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
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
