// lib/breadcrumbs.js
// BreadcrumbList JSON-LD from the same [{ label, href }] trail the visible
// <Breadcrumbs> component renders, so the two cannot drift apart.

import { SITE_URL } from './site';

function absolute(href) {
  if (!href) return undefined;
  if (/^https?:\/\//.test(href)) return href;
  return `${SITE_URL}${href === '/' ? '/' : href}`;
}

// items: [{ label, href }]; the last item's href should be the canonical URL
// of the current page (absolute or site-relative).
export function breadcrumbJsonLd(items = []) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absolute(item.href) } : {}),
    })),
  };
}

// Labels match the BreadcrumbList JSON-LD the question pages already emit
// (lib/writingQuestionSeo.js, lib/speakingQuestionSeo.js, the Reading and
// Listening page components), so visible and structured trails agree.
const SKILL_HUBS = {
  reading: { label: 'IELTS Reading', href: '/readingquestion' },
  writing: { label: 'IELTS Writing', href: '/writingquestion' },
  listening: { label: 'IELTS Listening', href: '/listeningquestion' },
  speaking: { label: 'IELTS Speaking', href: '/speakingquestion' },
};

// Home › <Skill> practice › <title>
export function questionBreadcrumbs(skill, title, canonicalUrl) {
  const hub = SKILL_HUBS[skill];
  return [
    { label: 'Home', href: '/' },
    ...(hub ? [hub] : []),
    { label: title || 'Practice question', href: canonicalUrl },
  ];
}
