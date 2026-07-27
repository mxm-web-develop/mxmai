/**
 * Refresh Token Integration Tests (P0)
 *
 * Tests for POST /api/v1/account/refresh-token
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';
import { generateTestEmail, generateTestUsername, deleteTestUser } from '../../helpers/cleanup';

const app = createTestApp();

describe('Refresh Token Endpoint', () => {
  const testPassword = 'Test@123456';
  let testUserEmail: string;
  let refreshToken: string;

  beforeEach(async () => {
    testUserEmail = generateTestEmail('refresh');

    const response = await request(app)
      .post('/api/v1/account/register')
      .send({
        username: generateTestUsername('refresh'),
        email: testUserEmail,
        password: testPassword,
      });

    refreshToken = response.body.data.tokens.refreshToken;
  });

  afterEach(async () => {
    await deleteTestUser(testUserEmail);
  });

  describe('POST /api/v1/account/refresh-token', () => {
    it('should return new tokens with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/account/refresh-token')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('code', 200);
      expect(response.body).toHaveProperty('message', 'Token refreshed successfully');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('expiresIn');
      expect(response.body.data.accessToken).not.toBe(refreshToken);
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should return 400 when refresh_token is missing', async () => {
      const response = await request(app)
        .post('/api/v1/account/refresh-token')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
    });

    it('should return 401 when refresh_token is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/account/refresh-token')
        .send({ refresh_token: 'invalid_refresh_token' })
        .expect(401);

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body).toHaveProperty('error', 'UNAUTHORIZED');
    });

    it('should return 401 when token type is not refresh', async () => {
      // Use access token instead of refresh token
      const response = await request(app)
        .post('/api/v1/account/register')
        .send({
          username: generateTestUsername('accesstoken'),
          email: generateTestEmail('accesstoken'),
          password: testPassword,
        });

      const accessToken = response.body.data.tokens.accessToken;

      const failResponse = await request(app)
        .post('/api/v1/account/refresh-token')
        .send({ refresh_token: accessToken })
        .expect(401);

      expect(failResponse.body).toHaveProperty('code', 401);
      expect(failResponse.body.message).toBe('Invalid token type');

      await deleteTestUser(generateTestEmail('accesstoken'));
    });
  });
});