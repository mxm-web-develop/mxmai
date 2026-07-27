import { describe, expect, it } from 'vitest';
import { normalizeQhaiApiRoot, qhaiV1Url } from './base-url';

describe('normalizeQhaiApiRoot', () => {
  it('strips trailing /v1', () => {
    expect(normalizeQhaiApiRoot('https://api.qhaigc.net/v1')).toBe('https://api.qhaigc.net');
    expect(normalizeQhaiApiRoot('https://api.qhaigc.net/v1/')).toBe('https://api.qhaigc.net');
  });

  it('builds single /v1 in path', () => {
    expect(qhaiV1Url('/images/edits', 'https://api.qhaigc.net/v1')).toBe(
      'https://api.qhaigc.net/v1/images/edits',
    );
  });
});
