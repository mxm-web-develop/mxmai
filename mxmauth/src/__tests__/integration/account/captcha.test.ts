/**
 * Captcha Endpoint Integration Tests (P0)
 *
 * Tests for slide captcha GET/POST endpoints
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';

const app = createTestApp();

describe('Captcha Endpoint', () => {
  describe('GET /api/v1/account/captcha', () => {
    it('should return slide captcha data without auth', async () => {
      const response = await request(app)
        .get('/api/v1/account/captcha')
        .expect(200);

      expect(response.body).toHaveProperty('code', 200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('captchaId');
      expect(response.body.data).toHaveProperty('bgUrl');
      expect(response.body.data).toHaveProperty('puzzleUrl');
      expect(typeof response.body.data.captchaId).toBe('string');
      expect(response.body.data.bgUrl).toMatch(/^data:image\//);
      expect(response.body.data.puzzleUrl).toMatch(/^data:image\//);
    });
  });

  describe('POST /api/v1/account/captcha/verify', () => {
    it('should reject invalid slide payload', async () => {
      const created = await request(app).get('/api/v1/account/captcha').expect(200);
      const captchaId = created.body.data.captchaId as string;

      const response = await request(app)
        .post('/api/v1/account/captcha/verify')
        .send({
          captchaId,
          x: 0,
          duration: 50,
          trail: [[0, 0]],
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'CAPTCHA_INVALID');
    });
  });
});
