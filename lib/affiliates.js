// lib/affiliates.js
//
// Affiliate program registry. Every program is INERT until the founder sets its
// destination URL in an env var (AFFILIATE_URL_<ID>, see affiliateEnvVar). A
// program without a valid https URL is disabled: /go/<id> 404s and no placement
// renders anything for it. Setup guide: docs/growth-2026-09-23/AFFILIATE-SETUP.md.
//
// Two sides read this module:
//   * server (pages/go/[program].js) — reads the real URL from process.env at
//     request time. Affiliate URLs never appear in page HTML; pages only link to
//     /go/<id>, so a program can be swapped by changing one env var.
//   * client placements — cannot see server env vars, so next.config.js bakes
//     the list of configured program ids (never the URLs) into
//     process.env.AFFILIATE_PROGRAMS_ENABLED at build time. Adding or changing
//     an env var therefore needs a redeploy, which Vercel does anyway.
//
// Placement rule (docs/growth-2026-09-23/20-MONETIZATION-PLAN.md §3): Pro is the
// highest-value outcome, so affiliates never render for Pro users, never on
// practice/test/pricing/dashboard/checkout screens, and on score reports only
// BELOW the Pro offer. placementAllowedOnPath() is the path half of that rule.

export const AFFILIATE_ENV_PREFIX = 'AFFILIATE_URL_';

// rel for every link that points at /go/<id>.
export const AFFILIATE_REL = 'sponsored nofollow noopener';

export const AFFILIATE_DISCLOSURE =
  'We may earn a commission if you sign up or buy through this link. It doesn’t change what you pay.';

const NOT_AFFILIATED =
  'IELTS-Bank is an independent practice site and is not affiliated with or endorsed by IDP, the British Council or Cambridge.';

// countries: ISO 3166-1 alpha-2 codes of VISITORS allowed to see the program,
// or null for everyone. A gated program fails closed when the visitor's
// country is unknown.
const PROGRAM_LIST = [
  {
    id: 'preply',
    label: 'Preply',
    category: 'tutoring',
    countries: null,
    disclosure: AFFILIATE_DISCLOSURE,
  },
  {
    id: 'italki',
    label: 'italki',
    category: 'tutoring',
    countries: null,
    disclosure: AFFILIATE_DISCLOSURE,
  },
  {
    id: 'wise',
    label: 'Wise',
    category: 'money-transfer',
    countries: null,
    disclosure: AFFILIATE_DISCLOSURE,
  },
  {
    id: 'amber',
    label: 'Amber',
    category: 'student-housing',
    countries: null,
    disclosure: AFFILIATE_DISCLOSURE,
  },
  {
    id: 'insubuy',
    label: 'Insubuy',
    category: 'student-insurance',
    countries: null,
    disclosure: AFFILIATE_DISCLOSURE,
  },
  {
    id: 'leverage-edu',
    label: 'Leverage Edu',
    category: 'study-abroad-counselling',
    countries: ['IN'],
    disclosure: AFFILIATE_DISCLOSURE,
  },
  {
    id: 'amazon-cambridge-books',
    label: 'Amazon',
    category: 'books',
    countries: null,
    // Amazon's Operating Agreement requires this exact statement.
    disclosure: 'As an Amazon Associate we earn from qualifying purchases. It doesn’t change what you pay.',
  },
  {
    id: 'idp-booking',
    label: 'IDP IELTS',
    category: 'test-booking',
    countries: null,
    disclosure: `${AFFILIATE_DISCLOSURE} ${NOT_AFFILIATED}`,
  },
  {
    id: 'bc-booking',
    label: 'British Council IELTS',
    category: 'test-booking',
    countries: null,
    disclosure: `${AFFILIATE_DISCLOSURE} ${NOT_AFFILIATED}`,
  },
];

export function affiliateEnvVar(id) {
  return `${AFFILIATE_ENV_PREFIX}${String(id).toUpperCase().replace(/-/g, '_')}`;
}

// id <- env var name; the exact inverse of affiliateEnvVar. next.config.js uses
// the same convention to build AFFILIATE_PROGRAMS_ENABLED.
export function affiliateIdFromEnvVar(name) {
  if (typeof name !== 'string' || !name.startsWith(AFFILIATE_ENV_PREFIX)) return null;
  return name.slice(AFFILIATE_ENV_PREFIX.length).toLowerCase().replace(/_/g, '-');
}

export const AFFILIATE_PROGRAMS = Object.freeze(
  Object.fromEntries(
    PROGRAM_LIST.map((program) => [
      program.id,
      Object.freeze({ ...program, envVar: affiliateEnvVar(program.id) }),
    ])
  )
);

export const AFFILIATE_PROGRAM_IDS = Object.freeze(PROGRAM_LIST.map((program) => program.id));

export function getAffiliateProgram(id) {
  return Object.prototype.hasOwnProperty.call(AFFILIATE_PROGRAMS, id) ? AFFILIATE_PROGRAMS[id] : null;
}

// Only absolute https URLs count as configured; anything else (blank, typo,
// http, javascript:) leaves the program disabled rather than redirecting
// somewhere unsafe.
export function validAffiliateUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

// SERVER ONLY: the configured destination for a program, or null (disabled).
export function affiliateDestination(id, env = process.env) {
  const program = getAffiliateProgram(id);
  if (!program || !env) return null;
  return validAffiliateUrl(env[program.envVar]);
}

// SERVER/BUILD: ids of registry programs that have a valid URL configured.
export function configuredAffiliateIds(env = process.env) {
  return AFFILIATE_PROGRAM_IDS.filter((id) => affiliateDestination(id, env));
}

export function parseEnabledAffiliateIds(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  const requested = new Set(value.split(',').map((id) => id.trim()).filter(Boolean));
  return AFFILIATE_PROGRAM_IDS.filter((id) => requested.has(id));
}

// CLIENT-SAFE: ids enabled at build time. The literal process.env access is
// what Next inlines from next.config.js `env`; do not destructure it.
export function enabledAffiliateIds() {
  return parseEnabledAffiliateIds(process.env.AFFILIATE_PROGRAMS_ENABLED);
}

export function isAffiliateEnabled(id, enabled = enabledAffiliateIds()) {
  return Boolean(getAffiliateProgram(id)) && enabled.includes(id);
}

export function normalizeCountry(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function affiliateAllowedInCountry(id, country) {
  const program = getAffiliateProgram(id);
  if (!program) return false;
  if (!program.countries) return true;
  const code = normalizeCountry(country);
  return Boolean(code) && program.countries.includes(code);
}

// Enabled AND allowed for this visitor's country.
export function affiliateAvailable(id, { country = null, enabled = enabledAffiliateIds() } = {}) {
  return isAffiliateEnabled(id, enabled) && affiliateAllowedInCountry(id, country);
}

// First available program from a preference list (e.g. Preply, then italki).
export function firstAvailableAffiliate(ids, options = {}) {
  return ids.find((id) => affiliateAvailable(id, options)) || null;
}

export function affiliateHref(id, placement) {
  const base = `/go/${encodeURIComponent(id)}`;
  return placement ? `${base}?placement=${encodeURIComponent(placement)}` : base;
}

// Where each placement may appear. An allowlist, so a component reused on a new
// page renders nothing until someone deliberately adds that page here — and
// practice, mock, pricing, billing, dashboard and checkout screens never match.
// The two *_result placements live on the question pages but render only on the
// post-score report, below the Pro offer (see TutorCta).
export const AFFILIATE_PLACEMENTS = Object.freeze({
  writing_result: /^\/writingquestion\/[^/?#]+/,
  speaking_result: /^\/speakingquestion\/[^/?#]+/,
  score_requirements: /^\/ielts-score-requirements\/[^/?#]+/,
  blog_books: /^\/blog\/[^/?#]+/,
});

export function placementAllowedOnPath(placement, path) {
  const pattern = AFFILIATE_PLACEMENTS[placement];
  if (!pattern || typeof path !== 'string') return false;
  return pattern.test(path);
}

// Destination-country pages (/ielts-score-requirements/<slug>) → ISO code.
export const SCORE_REQUIREMENT_DESTINATIONS = Object.freeze({
  'united-kingdom': 'GB',
  canada: 'CA',
  australia: 'AU',
  'united-states': 'US',
  'new-zealand': 'NZ',
  ireland: 'IE',
  germany: 'DE',
  netherlands: 'NL',
  'united-arab-emirates': 'AE',
  singapore: 'SG',
});

const AMBER_DESTINATIONS = new Set(['GB', 'AU', 'CA', 'US', 'IE', 'NZ']);
const INSUBUY_DESTINATIONS = new Set(['US']);
export const NEXT_STEPS_MAX_LINKS = 3;

// "Next steps after your score" programs for one destination page and one
// visitor, in display order, capped at NEXT_STEPS_MAX_LINKS. Leverage Edu leads
// for Indian visitors (highest value per lead); the rest are destination-based.
export function nextStepsPrograms(countrySlug, { country = null, enabled = enabledAffiliateIds() } = {}) {
  const destination = SCORE_REQUIREMENT_DESTINATIONS[countrySlug] || null;
  const candidates = ['leverage-edu', 'wise'];
  if (destination && AMBER_DESTINATIONS.has(destination)) candidates.push('amber');
  if (destination && INSUBUY_DESTINATIONS.has(destination)) candidates.push('insubuy');
  return candidates
    .filter((id) => affiliateAvailable(id, { country, enabled }))
    .slice(0, NEXT_STEPS_MAX_LINKS);
}

// Blog posts that get the Cambridge IELTS books module: tagged for books or
// study planning, or (since most posts carry few tags) a slug that is clearly
// about study plans or prep resources.
export const BOOK_POST_TAGS = Object.freeze(['books', 'study-plan', 'resources', 'self-study']);
const BOOK_POST_SLUG_RE = /(?:^|-)(?:study-plan|practice-resources|books?|cambridge-ielts)(?:-|$)/;

export function postWantsBooksModule(post) {
  if (!post || typeof post !== 'object') return false;
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).toLowerCase()) : [];
  if (tags.some((tag) => BOOK_POST_TAGS.includes(tag))) return true;
  return typeof post.slug === 'string' && BOOK_POST_SLUG_RE.test(post.slug);
}

export function countryFromCookie(cookieString) {
  const match = /(?:^|;\s*)ib_country=([A-Za-z]{2})(?:;|$)/.exec(String(cookieString || ''));
  return match ? match[1].toUpperCase() : null;
}
