/**
 * Health Check Integration Tests (P0)
 *
 * Tests for GET /health endpoint
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-app';

const app = createTestApp();

describe('Health Check Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 OK with correct structure', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Response is wrapped by responseMiddleware: { code: 200, data: { status, service } }
      expect(response.body).toHaveProperty('code', 200);
      expect(response.body.data).toHaveProperty('status', 'ok');
      expect(response.body.data).toHaveProperty('service', 'mxmauth');
    });
  });
});