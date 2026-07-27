/**
 * User Registration Integration Tests (P0)
 *
 * Tests for POST /api/v1/account/register
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';
import { generateTestEmail, generateTestUsername, deleteTestUser, deleteTestUserByUsername } from '../../helpers/cleanup';

const app = createTestApp();

describe('User Registration Endpoint', () => {
  const testPassword = 'Test@123456';

  describe('POST /api/v1/account/register', () => {
    describe('Happy Path', () => {
      it('should register a new user with email', async () => {
        const email = generateTestEmail('register');
        const username = generateTestUsername('register');

        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            username,
            email,
            password: testPassword,
          })
          .expect(201);

        expect(response.body).toHaveProperty('code', 201);
        expect(response.body).toHaveProperty('message', 'User registered successfully');
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data).toHaveProperty('tokens');
        expect(response.body.data.user).toHaveProperty('id');
        expect(response.body.data.user).toHaveProperty('username', username);
        expect(response.body.data.user).toHaveProperty('email', email);
        expect(response.body.data.user).not.toHaveProperty('password_hash');
        expect(response.body.data.tokens).toHaveProperty('accessToken');
        expect(response.body.data.tokens).toHaveProperty('refreshToken');
        expect(response.body.data.tokens).toHaveProperty('expiresIn');

        // Cleanup
        await deleteTestUser(email);
      });

      it('should register a new user with phone', async () => {
        const username = generateTestUsername('register_phone');
        const phone = `138${Date.now().toString().slice(-8)}`;

        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            username,
            phone,
            password: testPassword,
          })
          .expect(201);

        expect(response.body).toHaveProperty('code', 201);
        expect(response.body.data.user).toHaveProperty('phone', phone);

        // Cleanup
        await deleteTestUserByUsername(username);
      });
    });

    describe('Error Path - Validation Errors', () => {
      it('should return 400 when username is missing', async () => {
        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            email: generateTestEmail('missing_username'),
            password: testPassword,
          })
          .expect(400);

        expect(response.body).toHaveProperty('code', 400);
        expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
        expect(response.body.message).toContain('Username');
      });

      it('should return 400 when password is missing', async () => {
        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            username: generateTestUsername('missing_password'),
            email: generateTestEmail('missing_password'),
          })
          .expect(400);

        expect(response.body).toHaveProperty('code', 400);
        expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
        expect(response.body.message).toContain('password', 'Password');
      });

      it('should return 400 when neither email nor phone is provided', async () => {
        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            username: generateTestUsername('no_contact'),
            password: testPassword,
          })
          .expect(400);

        expect(response.body).toHaveProperty('code', 400);
        expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
        expect(response.body.message).toContain('Email or phone');
      });

      it('should return 400 when username is empty string', async () => {
        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            username: '',
            email: generateTestEmail('empty_username'),
            password: testPassword,
          })
          .expect(400);

        expect(response.body).toHaveProperty('code', 400);
        expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      });
    });

    describe('Error Path - Duplicate', () => {
      it('should return 409 when email already exists', async () => {
        const email = generateTestEmail('duplicate');
        const username = generateTestUsername('duplicate');

        // First registration - should succeed
        await request(app)
          .post('/api/v1/account/register')
          .send({
            username,
            email,
            password: testPassword,
          })
          .expect(201);

        // Second registration with same email - should fail
        const response = await request(app)
          .post('/api/v1/account/register')
          .send({
            username: generateTestUsername('duplicate2'),
            email,
            password: testPassword,
          })
          .expect(409);

        expect(response.body).toHaveProperty('code', 409);
        expect(response.body).toHaveProperty('error', 'DUPLICATE');

        // Cleanup
        await deleteTestUser(email);
      });
    });
  });
});