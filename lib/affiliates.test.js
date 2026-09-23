import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AFFILIATE_PROGRAM_IDS,
  AFFILIATE_PROGRAMS,
  AFFILIATE_REL,
  affiliateAllowedInCountry,
  affiliateAvailable,
  affiliateDestination,
  affiliateEnvVar,
  affiliateHref,
  affiliateIdFromEnvVar,
  configuredAffiliateIds,
  countryFromCookie,
  enabledAffiliateIds,
  firstAvailableAffiliate,
  isAffiliateEnabled,
  nextStepsPrograms,
  parseEnabledAffiliateIds,
  placementAllowedOnPath,
  postWantsBooksModule,
  validAffiliateUrl,
} from './affiliates';

const EXPECTED_IDS = [
  'preply',
  'italki',
  'wise',
  'amber',
  'insubuy',
  'leverage-edu',
  'amazon-cambridge-books',
  'idp-booking',
  'bc-booking',
];

describe('affiliate registry', () => {
  it('lists every planned program with a label, disclosure and env var', () => {
    expect(AFFILIATE_PROGRAM_IDS).toEqual(EXPECTED_IDS);
    for (const id of EXPECTED_IDS) {
      const program = AFFILIATE_PROGRAMS[id];
      expect(program.id).toBe(id);
      expect(program.label).toBeTruthy();
      expect(program.disclosure).toMatch(/earn/i);
      expect(program.envVar).toBe(affiliateEnvVar(id));
      expect(affiliateIdFromEnvVar(program.envVar)).toBe(id);
    }
    expect(AFFILIATE_PROGRAMS.preply.envVar).toBe('AFFILIATE_URL_PREPLY');
    expect(AFFILIATE_PROGRAMS['leverage-edu'].envVar).toBe('AFFILIATE_URL_LEVERAGE_EDU');
    expect(AFFILIATE_PROGRAMS['amazon-cambridge-books'].envVar).toBe(
      'AFFILIATE_URL_AMAZON_CAMBRIDGE_BOOKS'
    );
  });

  it('uses Amazon’s required statement and a non-affiliation line for test booking', () => {
    expect(AFFILIATE_PROGRAMS['amazon-cambridge-books'].disclosure).toContain(
      'As an Amazon Associate we earn from qualifying purchases.'
    );
    expect(AFFILIATE_PROGRAMS['idp-booking'].disclosure).toMatch(/not affiliated/);
    expect(AFFILIATE_PROGRAMS['bc-booking'].disclosure).toMatch(/not affiliated/);
  });

  it('marks every affiliate link sponsored + nofollow', () => {
    expect(AFFILIATE_REL.split(' ')).toEqual(expect.arrayContaining(['sponsored', 'nofollow']));
    expect(affiliateHref('preply', 'writing_result')).toBe('/go/preply?placement=writing_result');
    expect(affiliateHref('wise')).toBe('/go/wise');
  });
});

describe('enable / disable', () => {
  it('is disabled with no URL, a blank URL, http or a non-URL', () => {
    expect(affiliateDestination('preply', {})).toBeNull();
    expect(affiliateDestination('preply', { AFFILIATE_URL_PREPLY: '   ' })).toBeNull();
    expect(affiliateDestination('preply', { AFFILIATE_URL_PREPLY: 'http://preply.com/x' })).toBeNull();
    expect(affiliateDestination('preply', { AFFILIATE_URL_PREPLY: 'javascript:alert(1)' })).toBeNull();
    expect(affiliateDestination('preply', { AFFILIATE_URL_PREPLY: 'not a url' })).toBeNull();
    expect(validAffiliateUrl(undefined)).toBeNull();
  });

  it('is enabled with an https URL, and unknown programs never are', () => {
    const env = { AFFILIATE_URL_PREPLY: ' https://preply.com/en/?pref=abc ' };
    expect(affiliateDestination('preply', env)).toBe('https://preply.com/en/?pref=abc');
    expect(affiliateDestination('nope', { AFFILIATE_URL_NOPE: 'https://x.test' })).toBeNull();
    expect(affiliateDestination('constructor', env)).toBeNull();
    expect(
      configuredAffiliateIds({
        AFFILIATE_URL_WISE: 'https://wise.com/invite/x',
        AFFILIATE_URL_PREPLY: 'https://preply.com/x',
        AFFILIATE_URL_ITALKI: '',
      })
    ).toEqual(['preply', 'wise']);
  });

  it('parses the build-time enabled list against the registry only', () => {
    expect(parseEnabledAffiliateIds('')).toEqual([]);
    expect(parseEnabledAffiliateIds(undefined)).toEqual([]);
    expect(parseEnabledAffiliateIds('wise, preply,evil,leverage-edu')).toEqual([
      'preply',
      'wise',
      'leverage-edu',
    ]);
    expect(isAffiliateEnabled('wise', ['wise'])).toBe(true);
    expect(isAffiliateEnabled('wise', [])).toBe(false);
    expect(isAffiliateEnabled('evil', ['evil'])).toBe(false);
  });

  describe('client list from process.env.AFFILIATE_PROGRAMS_ENABLED', () => {
    const original = process.env.AFFILIATE_PROGRAMS_ENABLED;
    afterEach(() => {
      if (original === undefined) delete process.env.AFFILIATE_PROGRAMS_ENABLED;
      else process.env.AFFILIATE_PROGRAMS_ENABLED = original;
    });

    it('defaults to nothing enabled', () => {
      delete process.env.AFFILIATE_PROGRAMS_ENABLED;
      expect(enabledAffiliateIds()).toEqual([]);
      expect(isAffiliateEnabled('preply')).toBe(false);
    });

    it('reads the inlined list', () => {
      process.env.AFFILIATE_PROGRAMS_ENABLED = 'italki,wise';
      expect(enabledAffiliateIds()).toEqual(['italki', 'wise']);
      expect(firstAvailableAffiliate(['preply', 'italki'])).toBe('italki');
    });
  });

  describe('next.config.js build-time list', () => {
    const keys = ['AFFILIATE_URL_PREPLY', 'AFFILIATE_URL_LEVERAGE_EDU', 'AFFILIATE_URL_WISE'];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    afterEach(() => {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      vi.resetModules();
    });

    it('bakes configured ids — never URLs — into env.AFFILIATE_PROGRAMS_ENABLED', async () => {
      process.env.AFFILIATE_URL_PREPLY = 'https://preply.com/?pref=secret';
      process.env.AFFILIATE_URL_LEVERAGE_EDU = 'https://leverageedu.com/?ref=secret';
      process.env.AFFILIATE_URL_WISE = 'http://insecure.example';
      vi.resetModules();
      const config = (await import('../next.config.js')).default;
      const baked = config.env.AFFILIATE_PROGRAMS_ENABLED;
      expect(parseEnabledAffiliateIds(baked)).toEqual(['preply', 'leverage-edu']);
      expect(baked).not.toContain('secret');
      expect(baked).not.toContain('wise');
    });
  });
});

describe('country gating', () => {
  it('allows ungated programs everywhere', () => {
    expect(affiliateAllowedInCountry('wise', 'SG')).toBe(true);
    expect(affiliateAllowedInCountry('wise', null)).toBe(true);
  });

  it('shows Leverage Edu to Indian visitors only, failing closed on unknown geo', () => {
    expect(affiliateAllowedInCountry('leverage-edu', 'IN')).toBe(true);
    expect(affiliateAllowedInCountry('leverage-edu', 'in')).toBe(true);
    expect(affiliateAllowedInCountry('leverage-edu', 'SG')).toBe(false);
    expect(affiliateAllowedInCountry('leverage-edu', null)).toBe(false);
    expect(affiliateAllowedInCountry('leverage-edu', 'XYZ')).toBe(false);
    expect(affiliateAvailable('leverage-edu', { country: 'IN', enabled: [] })).toBe(false);
    expect(affiliateAvailable('leverage-edu', { country: 'IN', enabled: ['leverage-edu'] })).toBe(true);
  });

  it('reads the ib_country cookie', () => {
    expect(countryFromCookie('a=1; ib_country=IN; b=2')).toBe('IN');
    expect(countryFromCookie('ib_country=')).toBeNull();
    expect(countryFromCookie('')).toBeNull();
  });
});

describe('next steps on score-requirement pages', () => {
  const all = [...EXPECTED_IDS];

  it('offers Wise + Amber on UK, Amber only for the six study destinations', () => {
    expect(nextStepsPrograms('united-kingdom', { country: 'SG', enabled: all })).toEqual(['wise', 'amber']);
    expect(nextStepsPrograms('germany', { country: 'SG', enabled: all })).toEqual(['wise']);
    for (const slug of ['australia', 'canada', 'ireland', 'new-zealand']) {
      expect(nextStepsPrograms(slug, { country: 'SG', enabled: all })).toContain('amber');
    }
  });

  it('adds Insubuy on the US page only', () => {
    expect(nextStepsPrograms('united-states', { country: 'SG', enabled: all })).toEqual([
      'wise',
      'amber',
      'insubuy',
    ]);
    expect(nextStepsPrograms('canada', { country: 'SG', enabled: all })).not.toContain('insubuy');
  });

  it('leads with Leverage Edu for Indian visitors and caps at 3 links', () => {
    expect(nextStepsPrograms('united-states', { country: 'IN', enabled: all })).toEqual([
      'leverage-edu',
      'wise',
      'amber',
    ]);
    expect(nextStepsPrograms('united-kingdom', { country: 'US', enabled: all })).not.toContain('leverage-edu');
  });

  it('renders nothing when no program is configured', () => {
    expect(nextStepsPrograms('united-kingdom', { country: 'IN', enabled: [] })).toEqual([]);
  });
});

describe('placement allowlist', () => {
  it('permits each placement only on its own surface', () => {
    expect(placementAllowedOnPath('writing_result', '/writingquestion/abc123')).toBe(true);
    expect(placementAllowedOnPath('speaking_result', '/speakingquestion/xyz')).toBe(true);
    expect(placementAllowedOnPath('score_requirements', '/ielts-score-requirements/canada')).toBe(true);
    expect(placementAllowedOnPath('blog_books', '/blog/ielts-30-day-study-plan')).toBe(true);
    expect(placementAllowedOnPath('writing_result', '/blog/x')).toBe(false);
    expect(placementAllowedOnPath('unknown', '/blog/x')).toBe(false);
  });

  it.each([
    '/pricing',
    '/billing/manage',
    '/dashboard',
    '/mock/full-test',
    '/mock-test',
    '/band-estimator',
    '/ielts-writing-checker',
    '/speaking-examiner',
    '/readingquestion/abc',
    '/listeningquestion/abc',
    '/writingquestion',
    '/blog',
    '/ielts-score-requirements',
  ])('never allows any placement on %s', (path) => {
    for (const placement of ['writing_result', 'speaking_result', 'score_requirements', 'blog_books']) {
      expect(placementAllowedOnPath(placement, path)).toBe(false);
    }
  });
});

describe('books module matching', () => {
  it('matches book/study-plan tags and study-plan/resource slugs', () => {
    expect(postWantsBooksModule({ slug: 'x', tags: ['Books'] })).toBe(true);
    expect(postWantsBooksModule({ slug: 'x', tags: ['study-plan'] })).toBe(true);
    expect(postWantsBooksModule({ slug: 'ielts-30-day-study-plan' })).toBe(true);
    expect(postWantsBooksModule({ slug: 'best-free-ielts-practice-resources' })).toBe(true);
    expect(postWantsBooksModule({ slug: 'ielts-writing-task-2-planning-your-essay', tags: ['writing'] })).toBe(false);
    expect(postWantsBooksModule({ slug: 'notebook-tips' })).toBe(false);
    expect(postWantsBooksModule(null)).toBe(false);
  });
});
