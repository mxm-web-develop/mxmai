/**
 * Repository Factory 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RepositoryFactory, initRepositoryFactory } from '../../factories/RepositoryFactory';
import { SupabaseUserRepository } from '../../adapters/supabase/SupabaseUserRepository';
import { MinIOStorageRepository } from '../../adapters/minio/MinIOStorageRepository';
import type { DataLayerConfig } from '../../config/dataConfig';

describe('RepositoryFactory', () => {
  beforeEach(() => {
    // 重置工厂状态
    vi.clearAllMocks();
  });

  describe('initRepositoryFactory', () => {
    it('should initialize with Supabase config', () => {
      const config: DataLayerConfig = {
        adapter: 'supabase',
        supabase: {
          url: 'https://test.supabase.co',
          anonKey: 'test-key',
        },
        minio: {
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        },
      };

      expect(() => initRepositoryFactory(config)).not.toThrow();
    });

    it('should handle missing Supabase config gracefully', () => {
      const config: DataLayerConfig = {
        adapter: 'supabase',
        minio: {
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        },
      };

      // 注意：initRepositoryFactory 不会立即验证配置
      // 只有在创建 Repository 时才会尝试初始化客户端
      // 由于 Supabase 配置缺失，初始化客户端可能会失败
      // 但实际行为取决于 initSupabaseClient 的实现
      // 这里我们只测试配置可以设置，实际错误会在运行时发生
      expect(() => initRepositoryFactory(config)).not.toThrow();
    });
  });

  describe('createUserRepository', () => {
    it('should create SupabaseUserRepository when adapter is supabase', () => {
      const config: DataLayerConfig = {
        adapter: 'supabase',
        supabase: {
          url: 'https://test.supabase.co',
          anonKey: 'test-key',
        },
        minio: {
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        },
      };

      initRepositoryFactory(config);
      const repo = RepositoryFactory.createUserRepository();

      expect(repo).toBeInstanceOf(SupabaseUserRepository);
    });

    it('should throw error for non-supabase adapter', () => {
      // 使用类型断言测试不支持的适配器
      const config = {
        adapter: 'postgresql' as any,
        minio: {
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        },
      };

      initRepositoryFactory(config as DataLayerConfig);
      expect(() => RepositoryFactory.createUserRepository()).toThrow('当前只支持 Supabase 适配器');
    });
  });

  describe('createStorageRepository', () => {
    it('should create MinIOStorageRepository', () => {
      const config: DataLayerConfig = {
        adapter: 'supabase',
        supabase: {
          url: 'https://test.supabase.co',
          anonKey: 'test-key',
        },
        minio: {
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        },
      };

      initRepositoryFactory(config);
      const repo = RepositoryFactory.createStorageRepository();

      expect(repo).toBeInstanceOf(MinIOStorageRepository);
    });
  });

  describe('createPaymentRepository', () => {
    it('should throw error (not implemented)', () => {
      const config: DataLayerConfig = {
        adapter: 'supabase',
        supabase: {
          url: 'https://test.supabase.co',
          anonKey: 'test-key',
        },
        minio: {
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        },
      };

      initRepositoryFactory(config);
      expect(() => RepositoryFactory.createPaymentRepository()).toThrow('Supabase payment repository not yet implemented');
    });
  });
});

