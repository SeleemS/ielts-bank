// lib/sanitize.js
// Central HTML/SVG sanitization for every dangerouslySetInnerHTML site that
// renders DB-sourced markup (reading passage body_html, writing prompt_html,
// listening transcript_html, question_groups.image_svg, blog post html).
//
// We use isomorphic-dompurify so the SAME sanitizer runs in Node (getStaticProps
// / getServerSideProps / API routes) AND in the browser. Sanitizing server-side
// means the pre-rendered HTML that ships in the build is already clean; the
// client re-sanitization is defence-in-depth.
//
// SECURITY MODEL: DOMPurify strips <script>, on* event-handler attributes,
// javascript: URLs and other active content BY DEFAULT. We additionally:
//   * enable the SVG + svgFilters profiles because writing Task 1 prompts are
//     gaining inline <svg> charts embedded in prompt_html this session, and the
//     standalone question_groups.image_svg maps/plans are inline SVG too;
//   * keep the HTML profile so ordinary passage/blog markup (p, h*, ul, table,
//     strong, a, img, etc.) is preserved unchanged;
//   * explicitly FORBID <script> and <foreignObject> (the latter is an SVG
//     element that can smuggle arbitrary HTML/JS back in).
// on* handlers are already forbidden by DOMPurify's defaults.

import DOMPurify from 'isomorphic-dompurify';

// Profiles allowing normal rich text AND inline SVG (charts / maps / plans).
const PROFILES = { html: true, svg: true, svgFilters: true };
const FORBID_TAGS = ['script', 'foreignObject'];

// Sanitize rich DB-sourced HTML that MAY contain inline SVG (passage body_html,
// writing prompt_html w/ inline chart, listening transcript_html, blog html).
export function sanitizeHtml(html) {
  if (html == null) return '';
  return DOMPurify.sanitize(String(html), {
    USE_PROFILES: PROFILES,
    FORBID_TAGS,
  });
}

// Sanitize a STANDALONE SVG string (question_groups.image_svg). Same profiles;
// the root element here is <svg> rather than flow HTML.
export function sanitizeSvg(svg) {
  if (svg == null) return '';
  return DOMPurify.sanitize(String(svg), {
    USE_PROFILES: PROFILES,
    FORBID_TAGS,
  });
}
