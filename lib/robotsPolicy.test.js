import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');

function parseGroups(source) {
  const groups = [];
  let agents = [];
  let rules = [];

  const flush = () => {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent' && rules.length) flush();
    if (key === 'user-agent') agents.push(value);
    if (key === 'allow' || key === 'disallow') rules.push({ key, value });
  }

  flush();
  return groups;
}

const groups = parseGroups(robots);
// /go/ = affiliate redirects (pages/go/[program].js): never crawl or index.
const protectedPaths = ['/dashboard', '/api/', '/auth/', '/go/'];

describe('robots crawl policy', () => {
  it('keeps private and system paths out of the wildcard crawler group', () => {
    const wildcard = groups.find(({ agents }) => agents.includes('*'));

    expect(wildcard).toBeDefined();
    expect(
      wildcard.rules.filter(({ key }) => key === 'disallow').map(({ value }) => value)
    ).toEqual(protectedPaths);
  });

  it.each(['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'])(
    'welcomes %s to public content without exposing protected paths',
    (bot) => {
      const group = groups.find(({ agents }) => agents.includes(bot));

      expect(group).toBeDefined();
      expect(group.rules).toContainEqual({ key: 'allow', value: '/' });
      expect(
        group.rules.filter(({ key }) => key === 'disallow').map(({ value }) => value)
      ).toEqual(protectedPaths);
    }
  );

  it.each(['Mediapartners-Google', 'Google-Display-Ads-Bot'])(
    'lets the AdSense crawler %s read every page',
    (bot) => {
      const group = groups.find(({ agents }) => agents.includes(bot));

      expect(group).toBeDefined();
      expect(group.rules).toEqual([{ key: 'allow', value: '/' }]);
    }
  );

  it('advertises the canonical HTTPS sitemap', () => {
    expect(robots).toContain('Sitemap: https://www.ielts-bank.com/sitemap.xml');
  });
});
