// lib/essayMarkup.js
// The tiny inline/block markup used in content/essays/*.md bodies, and its
// conversion to HTML. Pure and dependency-free so lib/essays.js (build time)
// and the tests share one implementation.
//
// SUPPORTED MARKUP (deliberately small — essays are prose, not documents):
//   ==phrase==   highlighted vocabulary / collocation (rendered as <mark>)
//   **bold**     emphasis in commentary
//   *italic*     titles / quoted wording in commentary
//   "- " lines   a bullet list (prompt bullet points, vocabulary, next-band notes)
//   blank line   paragraph break
//
// Everything is HTML-escaped FIRST and markers are applied afterwards, so no
// content file can inject markup into the page.

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline markers -> HTML, on already-escaped text. */
export function renderInline(text) {
  return escapeHtml(text)
    .replace(/==([^=\n]+?)==/g, '<mark>$1</mark>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
}

/** Strip every inline marker, leaving the words a reader actually sees. */
export function stripInline(text) {
  return String(text)
    .replace(/==([^=\n]+?)==/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1');
}

/** Split a block of text into paragraphs / bullet lists. */
export function toBlocks(text) {
  const blocks = [];
  String(text || '')
    .trim()
    .split(/\n\s*\n/)
    .forEach((chunk) => {
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      if (lines.every((l) => l.startsWith('- '))) {
        blocks.push({ type: 'list', items: lines.map((l) => l.slice(2).trim()) });
      } else {
        blocks.push({ type: 'p', text: lines.join(' ') });
      }
    });
  return blocks;
}

/** Block text -> HTML string. */
export function renderBlocks(text) {
  return toBlocks(text)
    .map((block) =>
      block.type === 'list'
        ? `<ul>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`
        : `<p>${renderInline(block.text)}</p>`
    )
    .join('');
}

/** Bulleted section -> array of item strings (raw markup). */
export function listItems(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

/** Words as IELTS counts them: whitespace-separated tokens of the visible text. */
export function countWords(text) {
  return stripInline(text)
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length;
}

/** Every ==highlighted== phrase in a text, in order. */
export function highlightsIn(text) {
  return [...String(text || '').matchAll(/==([^=\n]+?)==/g)].map((m) => m[1].trim());
}

/**
 * Split an essay body into its `## Heading` sections.
 * Returns { [heading]: text } with headings exactly as written.
 */
export function splitSections(body) {
  const sections = {};
  let current = null;
  String(body || '')
    .split('\n')
    .forEach((line) => {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading) {
        current = heading[1];
        sections[current] = '';
        return;
      }
      if (current) sections[current] += `${line}\n`;
    });
  Object.keys(sections).forEach((key) => {
    sections[key] = sections[key].trim();
  });
  return sections;
}
