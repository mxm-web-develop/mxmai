/**
 * User Profile Integration Tests (P0)
 *
 * Tests for GET /api/v1/account/profile
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';
import { createAuthHeader } from '../../helpers/auth-helpers';
import { generateTestEmail, generateTestUsername, deleteTestUser } from '../../helpers/cleanup';

const app = createTestApp();

describe('User Profile Endpoint', () => {
  const testPassword = 'Test@123456';
  let testUserEmail: string;
  let testUserUsername: string;
  let accessToken: string;
  let userId: string;

  beforeEach(async () => {
    testUserEmail = generateTestEmail('profile');
    testUserUsername = generateTestUsername('profile');

    const response = await request(app)
      .post('/api/v1/account/register')
      .send({
        username: testUserUsername,
        email: testUserEmail,
        password: testPassword,
      });

    accessToken = response.body.data.tokens.accessToken;
    userId = response.body.data.user.id;
  });

  afterEach(async () => {
    await deleteTestUser(testUserEmail);
  });

  describe('GET /api/v1/account/profile', () => {
    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/account/profile')
        .set(createAuthHeader(accessToken))
        .expect(200);

      expect(response.body).toHaveProperty('code', 200);
      expect(response.body.data).toHaveProperty('id', userId);
      expect(response.body.data).toHaveProperty('username', testUserUsername);
      expect(response.body.data).toHaveProperty('email', testUserEmail);
      expect(response.body.data).not.toHaveProperty('password_hash');
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/v1/account/profile')
        .expect(401);

      expect(response.body).toHaveProperty('code', 401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/account/profile')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body).toHaveProperty('code', 401);
    });
  });
});