// Privacy-friendly visitor labels: deterministic "adjective animal" alias +
// hue, seeded by the 8-char visitor hash the realtime RPC ships (never the
// raw anon id). Stable per visitor, meaningless to anyone else.

const ADJECTIVES = [
  'amber', 'brave', 'calm', 'coral', 'crimson', 'dapper', 'eager', 'fuzzy',
  'gentle', 'golden', 'hasty', 'ivory', 'jade', 'keen', 'lively', 'mellow',
  'misty', 'noble', 'olive', 'pink', 'plucky', 'quick', 'rosy', 'rustic',
  'sable', 'shy', 'silver', 'sly', 'snowy', 'sunny', 'swift', 'tan',
  'teal', 'tidy', 'velvet', 'violet', 'witty', 'zesty',
];

const ANIMALS = [
  'badger', 'bison', 'crane', 'dingo', 'falcon', 'ferret', 'finch', 'fox',
  'gecko', 'heron', 'ibex', 'jackal', 'koala', 'lemur', 'lynx', 'macaw',
  'marmot', 'mole', 'moose', 'mule', 'newt', 'ocelot', 'otter', 'owl',
  'panda', 'pika', 'quail', 'raven', 'seal', 'shrew', 'sloth', 'sparrow',
  'stork', 'tapir', 'toucan', 'viper', 'wombat', 'yak',
];

function hashInt(seed) {
  let h = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    h ^= seed.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function aliasFor(seed) {
  const h = hashInt(String(seed || 'anon'));
  const adjective = ADJECTIVES[h % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length];
  return {
    name: `${adjective} ${animal}`,
    hue: h % 360,
    color: `hsl(${h % 360} 55% 62%)`,
  };
}

// DiceBear-style cartoon avatar (external SVG keyed on the hash). Callers
// must render a colored-initial fallback for offline/error cases.
export function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}
