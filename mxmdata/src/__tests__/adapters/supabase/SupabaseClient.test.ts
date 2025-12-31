/**
 * Supabase 客户端测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSupabaseClient, resetSupabaseClient, getSupabaseClient } from '../../../adapters/supabase/SupabaseClient';

describe('SupabaseClient', () => {
  beforeEach(() => {
    resetSupabaseClient();
  });

  describe('initSupabaseClient', () => {
    it('should initialize client with config', () => {
      const config = {
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      };

      const client = initSupabaseClient(config);
      expect(client).toBeDefined();
    });

    it('should use serviceKey if provided', () => {
      const config = {
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
        serviceKey: 'test-service-key',
      };

      const client = initSupabaseClient(config);
      expect(client).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      const config = {
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      };

      const client1 = initSupabaseClient(config);
      const client2 = initSupabaseClient(config);
      expect(client1).toBe(client2);
    });
  });

  describe('getSupabaseClient', () => {
    it('should throw error if client not initialized', () => {
      expect(() => getSupabaseClient()).toThrow('Supabase client not initialized');
    });

    it('should return client after initialization', () => {
      const config = {
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      };

      initSupabaseClient(config);
      const client = getSupabaseClient();
      expect(client).toBeDefined();
    });
  });

  describe('resetSupabaseClient', () => {
    it('should reset client instance', () => {
      const config = {
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      };

      initSupabaseClient(config);
      resetSupabaseClient();
      expect(() => getSupabaseClient()).toThrow('Supabase client not initialized');
    });
  });
});

