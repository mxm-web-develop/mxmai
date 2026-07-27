import { describe, it, expect } from 'vitest';
import type { PartnerAppRecord } from '@mxmai/mxmdata';
import {
  buildH5LoginUrl,
  buildInviteUrl,
  buildOpenModeShareCopy,
  effectiveAllowedSlugs,
  generateInviteToken,
  hashInviteToken,
  isInviteTokenValid,
  isSlugAllowed,
  maskIdentitySubject,
} from './access-control';

function baseApp(overrides: Partial<PartnerAppRecord> = {}): PartnerAppRecord {
  return {
    id: 'app-1',
    owner_user_id: 'owner-1',
    api_key_id: 'key-1',
    name: 'Test',
    secret_hash: 'hash',
    secret_prefix: 'mxmps_abc',
    allowed_slugs: ['slug-a', 'slug-b'],
    status: 'active',
    end_user_access_mode: 'open',
    slug_access_mode: 'all_owner',
    invite_token_hash: null,
    h5_login_base_url: null,
    daily_end_user_quota: null,
    qps_limit: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('access-control', () => {
  describe('isInviteTokenValid', () => {
    it('returns true when token hash matches', () => {
      const { plain, hash } = generateInviteToken();
      const app = baseApp({ invite_token_hash: hash });
      expect(isInviteTokenValid(app, plain)).toBe(true);
    });

    it('returns false for wrong token', () => {
      const { hash } = generateInviteToken();
      const app = baseApp({ invite_token_hash: hash });
      expect(isInviteTokenValid(app, 'wrong-token')).toBe(false);
    });
  });

  describe('isSlugAllowed', () => {
    it('allows any slug in all_owner mode', () => {
      const app = baseApp({ slug_access_mode: 'all_owner', allowed_slugs: [] });
      expect(isSlugAllowed(app, 'anything')).toBe(true);
    });

    it('restricts to allowed_slugs in restricted mode', () => {
      const app = baseApp({
        slug_access_mode: 'restricted',
        allowed_slugs: ['slug-a'],
      });
      expect(isSlugAllowed(app, 'slug-a')).toBe(true);
      expect(isSlugAllowed(app, 'slug-b')).toBe(false);
    });

    it('denies all when restricted with empty slugs', () => {
      const app = baseApp({ slug_access_mode: 'restricted', allowed_slugs: [] });
      expect(isSlugAllowed(app, 'slug-a')).toBe(false);
    });
  });

  describe('effectiveAllowedSlugs', () => {
    it('returns empty for all_owner', () => {
      expect(effectiveAllowedSlugs(baseApp())).toEqual([]);
    });

    it('returns allowed_slugs for restricted', () => {
      expect(
        effectiveAllowedSlugs(
          baseApp({ slug_access_mode: 'restricted', allowed_slugs: ['a'] })
        )
      ).toEqual(['a']);
    });
  });

  describe('buildH5LoginUrl', () => {
    it('builds login URL without invite param', () => {
      const app = baseApp({ h5_login_base_url: 'https://h5.example.com/' });
      expect(buildH5LoginUrl(app, 'https://fallback.example.com')).toBe(
        'https://h5.example.com/login'
      );
    });

    it('uses default origin when app has no base', () => {
      expect(buildH5LoginUrl(baseApp(), 'https://default.example.com')).toBe(
        'https://default.example.com/login'
      );
    });
  });

  describe('buildOpenModeShareCopy', () => {
    it('returns share text without invite token', () => {
      const app = baseApp({ h5_login_base_url: 'https://h5.example.com' });
      expect(buildOpenModeShareCopy(app)).toBe(
        '请使用手机验证码登录：https://h5.example.com/login'
      );
    });
  });

  describe('buildInviteUrl', () => {
    it('builds full URL with base', () => {
      const app = baseApp({ h5_login_base_url: 'https://h5.example.com/' });
      const url = buildInviteUrl(app, 'tok123', 'https://fallback.example.com');
      expect(url).toBe('https://h5.example.com/login?invite=tok123');
    });

    it('uses default origin when app has no base', () => {
      const url = buildInviteUrl(baseApp(), 'abc', 'https://default.example.com');
      expect(url).toBe('https://default.example.com/login?invite=abc');
    });
  });

  describe('maskIdentitySubject', () => {
    it('masks phone', () => {
      expect(maskIdentitySubject('sms', '13800138000')).toBe('138****8000');
    });
  });

  describe('hashInviteToken', () => {
    it('is deterministic', () => {
      expect(hashInviteToken('x')).toBe(hashInviteToken('x'));
    });
  });
});
