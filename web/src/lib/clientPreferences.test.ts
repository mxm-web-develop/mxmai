import { describe, expect, it, vi } from 'vitest';
import {
  readStoredThemePreference,
  resolveLanguageByCountry,
  resolveThemeByLocalHour,
  resolveThemeByLocalTime,
} from './clientPreferences';

describe('clientPreferences', () => {
  it('uses light theme between 7:00 and 17:59', () => {
    expect(resolveThemeByLocalHour(7)).toBe('light');
    expect(resolveThemeByLocalHour(12)).toBe('light');
    expect(resolveThemeByLocalHour(17)).toBe('light');
  });

  it('uses dark theme outside daytime hours', () => {
    expect(resolveThemeByLocalHour(6)).toBe('dark');
    expect(resolveThemeByLocalHour(18)).toBe('dark');
    expect(resolveThemeByLocalHour(23)).toBe('dark');
  });

  it('maps CN to zh and others to en', () => {
    expect(resolveLanguageByCountry('CN')).toBe('zh');
    expect(resolveLanguageByCountry('cn')).toBe('zh');
    expect(resolveLanguageByCountry('US')).toBe('en');
    expect(resolveLanguageByCountry(null)).toBe('en');
  });

  it('reads hour from Date', () => {
    expect(resolveThemeByLocalTime(new Date(2026, 6, 10, 10, 0, 0))).toBe('light');
    expect(resolveThemeByLocalTime(new Date(2026, 6, 10, 20, 0, 0))).toBe('dark');
  });
});

describe('manual preference flags', () => {
  it('ignores mxm-theme without mxm-theme-manual', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal('window', { localStorage: storage });

    store.set('mxm-theme', 'dark');
    expect(readStoredThemePreference()).toBeNull();
    store.set('mxm-theme-manual', '1');
    expect(readStoredThemePreference()).toBe('dark');

    vi.unstubAllGlobals();
  });
});
