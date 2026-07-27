import { describe, expect, it } from 'vitest';
import {
  cleanWebSearchItems,
  isLowQualitySearchHost,
  resolveWebSearchCleanOptions,
  stripSearchBoilerplate,
} from './web-search-result-clean';

describe('stripSearchBoilerplate', () => {
  it('strips Plus Icon mega-menu junk', () => {
    const raw =
      "* Plus Icon What To Watch. * Plus Icon What To Hear. Plus Icon Click to expand the Mega Menu. # Karina Longworth’s podcast";
    const out = stripSearchBoilerplate(raw);
    expect(out).not.toMatch(/Plus Icon/i);
    expect(out).not.toMatch(/Mega Menu/i);
    expect(out).toMatch(/Karina|podcast/i);
  });
});

describe('isLowQualitySearchHost', () => {
  it('flags reddit and x', () => {
    expect(isLowQualitySearchHost('reddit.com')).toBe(true);
    expect(isLowQualitySearchHost('www.reddit.com')).toBe(true);
    expect(isLowQualitySearchHost('x.com')).toBe(true);
    expect(isLowQualitySearchHost('variety.com')).toBe(false);
  });
});

describe('cleanWebSearchItems', () => {
  it('drops low-quality domains, strips boilerplate, dedupes', () => {
    const { items, filteredOut } = cleanWebSearchItems(
      [
        {
          title: 'Whoopi Goldberg Defends Elliot Page',
          snippet: 'Whoopi on The View defended casting.',
          url: 'https://variety.com/2026/a',
          domain: 'variety.com',
        },
        {
          title: 'reddit ask',
          snippet: 'Where do you get movie news?',
          url: 'https://www.reddit.com/r/Letterboxd/comments/1',
          domain: 'reddit.com',
        },
        {
          title: 'Whoopi Goldberg Defends Elliot Page',
          snippet: 'duplicate url path',
          url: 'https://variety.com/2026/a?utm=1',
          domain: 'variety.com',
        },
        {
          title: 'Podcast Sets New Season',
          snippet:
            '* Plus Icon What To Watch. Plus Icon Click to expand the Mega Menu. Karina Longworth podcast returns in September.',
          url: 'https://variety.com/2026/b',
          domain: 'variety.com',
        },
      ],
      { dropLowQualityDomains: true, stripBoilerplate: true, dedupeByUrlTitle: true }
    );
    expect(filteredOut).toBeGreaterThanOrEqual(2);
    expect(items.every((it) => !/reddit/i.test(String(it.domain ?? '') + String(it.url ?? '')))).toBe(
      true
    );
    expect(items.some((it) => /Plus Icon/i.test(String(it.snippet ?? '')))).toBe(false);
    expect(items.filter((it) => String(it.url ?? '').includes('variety.com/2026/a')).length).toBe(1);
  });
});

describe('resolveWebSearchCleanOptions', () => {
  it('industryTrend preferDefault opens clean; false disables', () => {
    expect(resolveWebSearchCleanOptions(undefined, true)?.dropLowQualityDomains).toBe(true);
    expect(resolveWebSearchCleanOptions(false, true)).toBeNull();
    expect(resolveWebSearchCleanOptions(undefined, false)).toBeNull();
  });
});
