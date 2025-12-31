/**
 * JWT Token 生成和验证测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyToken,
  extractTokenFromHeader,
} from './jwt';

// 设置测试环境变量
beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = '3600';
  process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = '604800';
});

describe('jwt', () => {
  const payload = {
    userId: 'user-123',
    username: 'testuser',
  };

  describe('generateAccessToken', () => {
    it('should generate an access token', () => {
      const token = generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT 格式: header.payload.signature
    });

    it('should include correct payload in token', () => {
      const token = generateAccessToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.type).toBe('access');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', () => {
      const token = generateRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should include correct payload in token', () => {
      const token = generateRefreshToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.type).toBe('refresh');
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const tokens = generateTokenPair(payload);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeDefined();
      expect(typeof tokens.expiresIn).toBe('number');
    });

    it('should generate different tokens', () => {
      const tokens = generateTokenPair(payload);

      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateAccessToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.type).toBe('access');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        verifyToken(invalidToken);
      }).toThrow();
    });

    it('should throw error for expired token', async () => {
      // 使用 jwt.sign 直接创建一个立即过期的 token
      const expiredToken = jwt.sign(
        {
          ...payload,
          type: 'access',
        },
        process.env.JWT_SECRET || 'test-secret-key',
        {
          expiresIn: '1s', // 1 秒后过期
        }
      );
      
      // 等待 token 过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(() => {
        verifyToken(expiredToken);
      }).toThrow('Token expired');
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = 'test-token-123';
      const header = `Bearer ${token}`;

      const extracted = extractTokenFromHeader(header);
      expect(extracted).toBe(token);
    });

    it('should return null for missing header', () => {
      const extracted = extractTokenFromHeader(undefined);
      expect(extracted).toBeNull();
    });

    it('should return null for invalid header format', () => {
      const extracted = extractTokenFromHeader('InvalidFormat token');
      expect(extracted).toBeNull();
    });

    it('should return null for header without Bearer prefix', () => {
      const extracted = extractTokenFromHeader('token-123');
      expect(extracted).toBeNull();
    });
  });
});

