/**
 * User Logout Integration Tests (P0)
 *
 * Tests for POST /api/v1/account/logout
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';
import { createTestToken, createAuthHeader } from '../../helpers/auth-helpers';
import { generateTestEmail, generateTestUsername, deleteTestUser } from '../../helpers/cleanup';

const app = createTestApp();

describe('User Logout Endpoint', () => {
  const testPassword = 'Test@123456';
  let testUserEmail: string;
  let testUserId: string;
  let testUserUsername: string;
  let accessToken: string;

  beforeEach(async () => {
    testUserEmail = generateTestEmail('logout');
    testUserUsername = generateTestUsername('logout');

    // Register and get user ID
    const response = await request(app)
      .post('/api/v1/account/register')
      .send({
        username: testUserUsername,
        email: testUserEmail,
        password: testPassword,
      });

    testUserId = response.body.data.user.id;
    accessToken = response.body.data.tokens.accessToken;
  });

  afterEach(async () => {
    await deleteTestUser(testUserEmail);
  });

  describe('POST /api/v1/account/logout', () => {
    it('should return 200 when logged out with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/account/logout')
        .set(createAuthHeader(accessToken))
        .expect(200);

      expect(response.body).toHaveProperty('code', 200);
      expect(response.body).toHaveProperty('message', 'Logout successful');
    });

    it('should return 401 when no token provided', async () => {
      const response = await request(app)
        .post('/api/v1/account/logout')
        .expect(401);

      expect(response.body).toHaveProperty('code', 401);
    });

    it('should return 401 when invalid token provided', async () => {
      const response = await request(app)
        .post('/api/v1/account/logout')
        .set('Authorization', 'Bearer invalid_token_here')
        .expect(401);

      expect(response.body).toHaveProperty('code', 401);
    });
  });
});