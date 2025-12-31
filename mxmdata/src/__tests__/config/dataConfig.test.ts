/**
 * 数据配置测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadDataConfig, type DataLayerConfig } from '../../config/dataConfig';

describe('loadDataConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load Supabase config from environment variables', () => {
    process.env.DATA_ADAPTER = 'supabase';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PORT = '9000';
    process.env.MINIO_USE_SSL = 'false';
    process.env.MINIO_ACCESS_KEY = 'minioadmin';
    process.env.MINIO_SECRET_KEY = 'minioadmin';

    const config = loadDataConfig();

    expect(config.adapter).toBe('supabase');
    expect(config.supabase?.url).toBe('https://test.supabase.co');
    expect(config.supabase?.anonKey).toBe('test-anon-key');
    expect(config.supabase?.serviceKey).toBe('test-service-key');
    expect(config.minio.endPoint).toBe('localhost');
    expect(config.minio.port).toBe(9000);
  });

  it('should use default adapter (supabase) if not specified', () => {
    delete process.env.DATA_ADAPTER;
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PORT = '9000';
    process.env.MINIO_USE_SSL = 'false';
    process.env.MINIO_ACCESS_KEY = 'minioadmin';
    process.env.MINIO_SECRET_KEY = 'minioadmin';

    const config = loadDataConfig();

    expect(config.adapter).toBe('supabase');
  });

  it('should throw error if Supabase URL missing', () => {
    process.env.DATA_ADAPTER = 'supabase';
    delete process.env.SUPABASE_URL;
    process.env.MINIO_ENDPOINT = 'localhost';

    expect(() => loadDataConfig()).toThrow('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  });

  it('should throw error if adapter is not supabase', () => {
    process.env.DATA_ADAPTER = 'postgresql';
    process.env.MINIO_ENDPOINT = 'localhost';

    expect(() => loadDataConfig()).toThrow('当前只支持 Supabase 适配器');
  });

  it('should use default MinIO port if not specified', () => {
    process.env.DATA_ADAPTER = 'supabase';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';
    process.env.MINIO_ENDPOINT = 'localhost';
    delete process.env.MINIO_PORT;
    process.env.MINIO_USE_SSL = 'false';
    process.env.MINIO_ACCESS_KEY = 'minioadmin';
    process.env.MINIO_SECRET_KEY = 'minioadmin';

    const config = loadDataConfig();

    expect(config.minio.port).toBe(9000);
  });
});

