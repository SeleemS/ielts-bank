// lib/relatedPractice.js
// Pure selection logic for the "Keep practising" block on question pages.
//
// The old rule took the first N items of an alphabetical list, so every page
// linked the same three passages ("A Beginner's Guide to Home Composting" had
// ~160 inbound links) while most passages had none — the main reason 67 Writing
// pages were orphans in the Sep 2026 crawl. This picks the items that FOLLOW
// the current one in each list (wrapping round), so the links form a ring:
// every item is linked from the items just before it, and link equity spreads
// evenly across the bank.

// Deterministic 32-bit string hash (FNV-1a) for items not present in the list.
function hashString(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// The `count` items after `currentId` in `list` (wrapping), excluding itself.
// If `currentId` is not in the list, start at a stable hashed offset.
export function ringNeighbours(list = [], currentId, count) {
  if (!list.length || count <= 0) return [];
  const index = list.findIndex((item) => item?.id === currentId);
  const start = index === -1 ? hashString(currentId) % list.length : index + 1;
  const out = [];
  for (let step = 0; step < list.length && out.length < count; step += 1) {
    const item = list[(start + step) % list.length];
    if (item?.id && item.id !== currentId) out.push(item);
  }
  return out;
}

// `preferred`: same question type / part (closest match), `all`: every item of
// the skill. Up to `preferredShare` come from the preferred ring, the rest from
// the full ring, never repeating an item or linking the current page.
export function pickRelatedPractice({ preferred = [], all = [], currentId, limit = 6, preferredShare = 4 }) {
  const seen = new Set([currentId]);
  const out = [];
  const take = (items, max) => {
    let taken = 0;
    for (const item of items) {
      if (out.length >= limit || taken >= max) break;
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      taken += 1;
    }
  };
  take(ringNeighbours(preferred, currentId, preferredShare + 1), preferredShare);
  take(ringNeighbours(all, currentId, limit + 1), limit);
  return out;
}
