// Self-hosted Inter via next/font/google (no external CDN request at runtime).
import { Inter } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});
