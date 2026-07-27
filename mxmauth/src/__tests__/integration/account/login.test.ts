/**
 * User Login Integration Tests (P0)
 *
 * Tests for POST /api/v1/account/login
 */

import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';
import { generateTestEmail, generateTestUsername, deleteTestUser } from '../../helpers/cleanup';

const app = createTestApp();

describe('User Login Endpoint', () => {
  const testPassword = 'Test@123456';
  let testUserEmail: string;
  let testUserUsername: string;

  beforeEach(async () => {
    // Create a test user before each login test
    testUserEmail = generateTestEmail('login');
    testUserUsername = generateTestUsername('login');

    await request(app)
      .post('/api/v1/account/register')
      .send({
        username: testUserUsername,
        email: testUserEmail,
        password: testPassword,
      });
  });

  afterEach(async () => {
    await deleteTestUser(testUserEmail);
  });

  describe('POST /api/v1/account/login', () => {
    describe('Happy Path', () => {
      it('should login with email', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            email: testUserEmail,
            password: testPassword,
          })
          .expect(200);

        expect(response.body).toHaveProperty('code', 200);
        expect(response.body).toHaveProperty('message', 'Login successful');
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data).toHaveProperty('tokens');
        expect(response.body.data.user).toHaveProperty('email', testUserEmail);
        expect(response.body.data.tokens).toHaveProperty('accessToken');
        expect(response.body.data.tokens).toHaveProperty('refreshToken');
        expect(response.body.data.tokens).toHaveProperty('expiresIn');
      });

      it('should login with username', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            username: testUserUsername,
            password: testPassword,
          })
          .expect(200);

        expect(response.body).toHaveProperty('code', 200);
        expect(response.body.data.user).toHaveProperty('username', testUserUsername);
      });
    });

    describe('Error Path - Invalid Credentials', () => {
      it('should return 401 for wrong password', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            email: testUserEmail,
            password: 'WrongPassword123',
          })
          .expect(401);

        expect(response.body).toHaveProperty('code', 401);
        expect(response.body).toHaveProperty('error', 'UNAUTHORIZED');
        expect(response.body.message).toBe('Invalid credentials');
      });

      it('should return 401 for non-existent email', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            email: 'nonexistent@test.com',
            password: testPassword,
          })
          .expect(401);

        expect(response.body).toHaveProperty('code', 401);
        expect(response.body).toHaveProperty('error', 'UNAUTHORIZED');
      });

      it('should return 401 for non-existent username', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            username: 'nonexistentuser',
            password: testPassword,
          })
          .expect(401);

        expect(response.body).toHaveProperty('code', 401);
        expect(response.body).toHaveProperty('error', 'UNAUTHORIZED');
      });
    });

    describe('Error Path - Validation Errors', () => {
      it('should return 400 when password is missing', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            email: testUserEmail,
          })
          .expect(400);

        expect(response.body).toHaveProperty('code', 400);
        expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      });

      it('should return 400 when no identifier provided', async () => {
        const response = await request(app)
          .post('/api/v1/account/login')
          .send({
            password: testPassword,
          })
          .expect(400);

        expect(response.body).toHaveProperty('code', 400);
        expect(response.body.message).toContain('Username', 'email', 'phone');
      });
    });
  });
});