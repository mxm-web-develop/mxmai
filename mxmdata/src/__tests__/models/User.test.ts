/**
 * User 模型测试
 */

import { describe, it, expect } from 'vitest';
import { toUserPublic, type User } from '../../models/User';

describe('User Model', () => {
  describe('toUserPublic', () => {
    it('should convert User to UserPublic', () => {
      const user: User = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        password_hash: 'hashed',
        avatar_url: 'https://example.com/avatar.jpg',
        level: 5,
        balance: 100.5,
        membership_type: 'pro',
        membership_expires_at: '2024-12-31T00:00:00Z',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const publicUser = toUserPublic(user);

      expect(publicUser.id).toBe('user-123');
      expect(publicUser.username).toBe('testuser');
      expect(publicUser.email).toBe('test@example.com');
      expect(publicUser.avatar_url).toBe('https://example.com/avatar.jpg');
      expect(publicUser.level).toBe(5);
      expect(publicUser.membership_type).toBe('pro');
      expect(publicUser.created_at).toBe('2024-01-01T00:00:00Z');

      // 确保不包含敏感信息
      expect('password_hash' in publicUser).toBe(false);
      expect('phone' in publicUser).toBe(false);
      expect('balance' in publicUser).toBe(false);
      expect('status' in publicUser).toBe(false);
    });

    it('should handle optional fields', () => {
      const user: User = {
        id: 'user-456',
        username: 'minimal',
        password_hash: 'hashed',
        level: 1,
        balance: 0,
        membership_type: 'free',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const publicUser = toUserPublic(user);

      expect(publicUser.id).toBe('user-456');
      expect(publicUser.username).toBe('minimal');
      expect(publicUser.email).toBeUndefined();
      expect(publicUser.avatar_url).toBeUndefined();
    });
  });
});

