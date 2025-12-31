/**
 * MinIO 客户端测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initMinIOClient, resetMinIOClient, getMinIOClient } from '../../../adapters/minio/MinIOClient';

describe('MinIOClient', () => {
  beforeEach(() => {
    resetMinIOClient();
  });

  describe('initMinIOClient', () => {
    it('should initialize client with config', () => {
      const config = {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
      };

      const client = initMinIOClient(config);
      expect(client).toBeDefined();
    });

    it('should include region if provided', () => {
      const config = {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
        region: 'us-east-1',
      };

      const client = initMinIOClient(config);
      expect(client).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      const config = {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
      };

      const client1 = initMinIOClient(config);
      const client2 = initMinIOClient(config);
      expect(client1).toBe(client2);
    });
  });

  describe('getMinIOClient', () => {
    it('should throw error if client not initialized', () => {
      expect(() => getMinIOClient()).toThrow('MinIO client not initialized');
    });

    it('should return client after initialization', () => {
      const config = {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
      };

      initMinIOClient(config);
      const client = getMinIOClient();
      expect(client).toBeDefined();
    });
  });

  describe('resetMinIOClient', () => {
    it('should reset client instance', () => {
      const config = {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
      };

      initMinIOClient(config);
      resetMinIOClient();
      expect(() => getMinIOClient()).toThrow('MinIO client not initialized');
    });
  });
});

