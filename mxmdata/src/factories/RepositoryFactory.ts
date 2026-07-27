/**
 * Repository 工厂
 * 根据配置动态创建 Repository 实例
 */

import type { IUserRepository } from '../interfaces/IUserRepository';
import type { IStorageRepository } from '../interfaces/IStorageRepository';
import type { IPaymentRepository } from '../interfaces/IPaymentRepository';
import type { IUserMediaRepository } from '../interfaces/IUserMediaRepository';
import type { IUserAgentRepository } from '../interfaces/IUserAgentRepository';
import type { IWalletRepository } from '../interfaces/IWalletRepository';
import type { IPromptOptimizerRepository } from '../interfaces/IPromptOptimizerRepository';
import type { IConversationRepository } from '../interfaces/IConversationRepository';
import type { IAgentConversationRepository } from '../interfaces/IAgentConversationRepository';
import type { ISmartflowRepository } from '../interfaces/ISmartflowRepository';
import type { ISmartflowExecutionRepository } from '../interfaces/ISmartflowExecutionRepository';
import type { IPromptTemplateRepository } from '../interfaces/IPromptTemplateRepository';
import type { ICGITaskRepository } from '../interfaces/ICGITaskRepository';
import type { IKnowledgeBaseRepository } from '../interfaces/IKnowledgeBaseRepository';
import type { IKnowledgeBaseDefaultsRepository } from '../interfaces/IKnowledgeBaseDefaultsRepository';
import type { IFolderRepository } from '../interfaces/IFolderRepository';
import type { IPromptEngineeringConfigRepository } from '../interfaces/IPromptEngineeringConfigRepository';
import type { IProviderApiKeyRepository } from '../interfaces/IProviderApiKeyRepository';
import type { IUserApiKeyRepository } from '../interfaces/IUserApiKeyRepository';
import type { IPublishedApiRepository } from '../interfaces/IPublishedApiRepository';
import type { IPublishedApiUsageRepository } from '../interfaces/IPublishedApiUsageRepository';
import type { IGraphModelConfigRepository } from '../interfaces/IGraphModelConfigRepository';
import type { ISensitiveWordRepository } from '../interfaces/ISensitiveWordRepository';
import type { IProviderModelRepository } from '../interfaces/IProviderModelRepository';
import type { IModelConfigRepository } from '../interfaces/IModelConfigRepository';
import type { IUserReferenceImageRepository } from '../interfaces/IUserReferenceImageRepository';
import type { IStorageObjectRepository } from '../interfaces/IStorageObjectRepository';
import type { IScopeConfigRepository } from '../interfaces/IScopeConfigRepository';
import type { ISearchScopeConfigRepository } from '../interfaces/ISearchScopeConfigRepository';
import type { IPartnerRepository } from '../interfaces/IPartnerRepository';
import { SupabaseUserRepository, SupabasePaymentRepository, SupabaseWalletRepository, SupabasePromptOptimizerRepository, SupabaseConversationRepository, SupabaseAgentConversationRepository, SupabaseSmartflowRepository, SupabaseSmartflowExecutionRepository, SupabasePromptTemplateRepository, SupabaseCGITaskRepository, SupabaseKnowledgeBaseRepository, SupabaseKnowledgeBaseDefaultsRepository, SupabaseFolderRepository, SupabasePromptEngineeringConfigRepository, SupabaseProviderApiKeyRepository, SupabaseUserApiKeyRepository, SupabasePublishedApiRepository, SupabasePublishedApiUsageRepository, SupabaseSensitiveWordRepository, SupabaseGraphModelConfigRepository, SupabaseProviderModelRepository, SupabaseModelConfigRepository, SupabaseUserReferenceImageRepository, SupabaseStorageObjectRepository, SupabaseGraphScopeConfigRepository, SupabaseVideoScopeConfigRepository, SupabaseAudioScopeConfigRepository, SupabaseMusicScopeConfigRepository, SupabaseWritingScopeConfigRepository, SupabaseOutlineScopeConfigRepository, SupabaseTextScopeConfigRepository, SupabaseKnowledgeScopeConfigRepository, SupabaseSearchScopeConfigRepository, SupabasePartnerRepository, initSupabaseClient } from '../adapters/supabase';
import { initMinIOClient } from '../adapters/minio';
import { loadDataConfig, type DataLayerConfig } from '../config/dataConfig';
import { getStorageService, StorageService } from '../storage/StorageService';
import { S3StorageAdapter } from '../storage/adapters/S3StorageAdapter';
import type { StorageDomain } from '../storage/StorageDomain';

let config: DataLayerConfig | null = null;

/**
 * 初始化 Repository 工厂
 * 必须在创建任何 Repository 之前调用
 */
export function initRepositoryFactory(customConfig?: DataLayerConfig): void {
  config = customConfig || loadDataConfig();

  // 初始化 Supabase 客户端（如果使用）
  if (config.adapter === 'supabase' && config.supabase) {
    initSupabaseClient(config.supabase);
  }

  // 初始化 MinIO 客户端
  initMinIOClient(config.minio);
}

/**
 * 获取配置（如果已初始化）
 */
function getConfig(): DataLayerConfig {
  if (!config) {
    // 自动初始化
    initRepositoryFactory();
  }
  return config!;
}

/**
 * 创建用户 Repository
 */
export function createUserRepository(): IUserRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase，这是推荐的方案
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器，PostgreSQL 适配器尚未实现。请使用 Supabase（它基于 PostgreSQL）');
  }
  
  return new SupabaseUserRepository();
}

/**
 * Domain-scoped storage adapter wrapper for backward-compatible IStorageRepository
 */
class DomainStorageRepository implements IStorageRepository {
  constructor(private domain: StorageDomain = 'generated') {}

  private adapter(): S3StorageAdapter {
    return getStorageService().forDomain(this.domain);
  }

  private bucket(): string {
    return getStorageService().getDomainConfig(this.domain).bucket;
  }

  async uploadFile(bucket: string, key: string, file: Buffer, options?: import('../interfaces/IStorageRepository').UploadOptions) {
    return this.adapter().uploadFile(bucket || this.bucket(), key, file, options);
  }

  async downloadFile(bucket: string, key: string) {
    return this.adapter().downloadFile(bucket, key);
  }

  async openReadStream(bucket: string, key: string, range?: import('../interfaces/ReadStreamRange').ReadStreamRange) {
    return this.adapter().openReadStream(bucket, key, range);
  }

  async deleteFile(bucket: string, key: string) {
    return this.adapter().deleteFile(bucket, key);
  }

  async getFileMetadata(bucket: string, key: string) {
    return this.adapter().getFileMetadata(bucket, key);
  }

  async getPresignedUrl(bucket: string, key: string, expiresIn?: number) {
    return this.adapter().getPresignedUrl(bucket, key, expiresIn);
  }

  async fileExists(bucket: string, key: string) {
    return this.adapter().fileExists(bucket, key);
  }

  async listFiles(bucket: string, options?: import('../interfaces/IStorageRepository').ListFilesOptions) {
    return this.adapter().listFiles(bucket, options);
  }

  async copyFile(sourceBucket: string, sourceKey: string, targetBucket: string, targetKey: string) {
    return this.adapter().copyFile(sourceBucket, sourceKey, targetBucket, targetKey);
  }
}

/**
 * 创建存储 Repository（默认 generated 域；向后兼容 MinIO 调用方）
 */
export function createStorageRepository(domain: StorageDomain = 'generated'): IStorageRepository {
  getConfig();
  return new DomainStorageRepository(domain);
}

/**
 * 创建支付 Repository
 */
export function createPaymentRepository(): IPaymentRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }
  
  return new SupabasePaymentRepository();
}

/**
 * 创建钱包 Repository
 */
export function createWalletRepository(): IWalletRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }
  
  return new SupabaseWalletRepository();
}

/**
 * Repository 工厂类（提供静态方法）
 */
export class RepositoryFactory {
  /**
   * 初始化工厂（可选，如果不调用会自动初始化）
   */
  static init(customConfig?: DataLayerConfig): void {
    initRepositoryFactory(customConfig);
  }

  /**
   * 创建用户 Repository
   */
  static createUserRepository(): IUserRepository {
    return createUserRepository();
  }

  /**
   * 创建存储 Repository（默认 generated 域）
   */
  static createStorageRepository(domain: StorageDomain = 'generated'): IStorageRepository {
    return createStorageRepository(domain);
  }

  /**
   * 获取 StorageService 门面
   */
  static getStorageService(): StorageService {
    getConfig();
    return getStorageService();
  }

  /**
   * 创建支付 Repository
   */
  static createPaymentRepository(): IPaymentRepository {
    return createPaymentRepository();
  }

  /**
   * 创建用户媒体 Repository
   * 注意：此接口需要业务模块（如 mxmcgi）实现具体的适配器
   */
  static createUserMediaRepository(): IUserMediaRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    // TODO: 实现 SupabaseUserMediaRepository
    throw new Error('Supabase user media repository not yet implemented');
  }

  /**
   * 创建用户助手项目 Repository
   * 注意：此接口需要业务模块（如 mxmcgi）实现具体的适配器
   */
  static createUserAgentRepository(): IUserAgentRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    // TODO: 实现 SupabaseUserAgentRepository
    throw new Error('Supabase user agent repository not yet implemented');
  }

  /**
   * 创建钱包 Repository
   */
  static createWalletRepository(): IWalletRepository {
    return createWalletRepository();
  }

  /**
   * 创建提示词优化 Repository
   */
  static createPromptOptimizerRepository(): IPromptOptimizerRepository {
    return createPromptOptimizerRepository();
  }

  /**
   * 创建对话 Repository
   */
  static createConversationRepository(): IConversationRepository {
    return createConversationRepository();
  }

  /**
   * 创建 Agent Chat v2 Repository
   */
  static createAgentConversationRepository(): IAgentConversationRepository {
    return createAgentConversationRepository();
  }

  /**
   * 创建 Smartflow Repository
   */
  static createSmartflowRepository(): ISmartflowRepository {
    return createSmartflowRepository();
  }

  /**
   * 创建 Smartflow 执行实例 Repository
   */
  static createSmartflowExecutionRepository(): ISmartflowExecutionRepository {
    return createSmartflowExecutionRepository();
  }

  /**
   * 创建 Prompt 模板 Repository
   */
  static createPromptTemplateRepository(): IPromptTemplateRepository {
    return createPromptTemplateRepository();
  }

  /**
   * 创建 CGI Task Repository
   */
  static createCGITaskRepository(): ICGITaskRepository {
    return createCGITaskRepository();
  }

  /**
   * 创建知识库 Repository
   */
  static createKnowledgeBaseRepository(): IKnowledgeBaseRepository {
    return createKnowledgeBaseRepository();
  }

  /**
   * 创建知识库默认绑定 Repository
   */
  static createKnowledgeBaseDefaultsRepository(): IKnowledgeBaseDefaultsRepository {
    return createKnowledgeBaseDefaultsRepository();
  }

  /**
   * 创建文件夹 Repository
   */
  static createFolderRepository(): IFolderRepository {
    return createFolderRepository();
  }

  /**
   * 创建提示词工程配置 Repository
   */
  static createPromptEngineeringConfigRepository(): IPromptEngineeringConfigRepository {
    return createPromptEngineeringConfigRepository();
  }

  static createProviderApiKeyRepository(): IProviderApiKeyRepository {
    return createProviderApiKeyRepository();
  }

  static createUserApiKeyRepository(): IUserApiKeyRepository {
    return createUserApiKeyRepository();
  }

  static createPublishedApiRepository(): IPublishedApiRepository {
    return createPublishedApiRepository();
  }

  static createPublishedApiUsageRepository(): IPublishedApiUsageRepository {
    return createPublishedApiUsageRepository();
  }

  static createSensitiveWordRepository(): ISensitiveWordRepository {
    return createSensitiveWordRepository();
  }

  /**
   * 创建 Graph 模型配置 Repository
   */
  static createGraphModelConfigRepository(): IGraphModelConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseGraphModelConfigRepository();
  }

  static createGraphScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseGraphScopeConfigRepository();
  }

  static createVideoScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseVideoScopeConfigRepository();
  }

  static createAudioScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseAudioScopeConfigRepository();
  }

  static createMusicScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseMusicScopeConfigRepository();
  }

  static createWritingScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseWritingScopeConfigRepository();
  }

  static createOutlineScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseOutlineScopeConfigRepository();
  }

  static createTextScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseTextScopeConfigRepository();
  }

  static createKnowledgeScopeConfigRepository(): IScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseKnowledgeScopeConfigRepository();
  }

  /**
   * 创建 Admin 模型配置 Repository
   */
  static createModelConfigRepository(): IModelConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseModelConfigRepository();
  }

  static createProviderModelRepository(): IProviderModelRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseProviderModelRepository();
  }

  static createUserReferenceImageRepository(): IUserReferenceImageRepository {
    return createUserReferenceImageRepository();
  }

  static createStorageObjectRepository(): IStorageObjectRepository {
    return createStorageObjectRepository();
  }

  /**
   * 创建 Search 搜索引擎配置 Repository
   */
  static createSearchScopeConfigRepository(): ISearchScopeConfigRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseSearchScopeConfigRepository();
  }

  static createPartnerRepository(): IPartnerRepository {
    const cfg = getConfig();
    if (cfg.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabasePartnerRepository();
  }
}

/**
 * 创建提示词优化 Repository
 */
export function createPromptOptimizerRepository(): IPromptOptimizerRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabasePromptOptimizerRepository();
}

/**
 * 创建对话 Repository
 */
export function createConversationRepository(): IConversationRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseConversationRepository();
}

/**
 * 创建 Agent Chat v2 Repository
 */
export function createAgentConversationRepository(): IAgentConversationRepository {
  const cfg = getConfig();
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }
  return new SupabaseAgentConversationRepository();
}

/**
 * 创建 Smartflow Repository
 */
export function createSmartflowRepository(): ISmartflowRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseSmartflowRepository();
}

/**
 * 创建 Smartflow 执行实例 Repository
 */
export function createSmartflowExecutionRepository(): ISmartflowExecutionRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseSmartflowExecutionRepository();
}

/**
 * 创建 Prompt 模板 Repository
 */
export function createPromptTemplateRepository(): IPromptTemplateRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabasePromptTemplateRepository();
}

/**
 * 创建 CGI Task Repository
 */
export function createCGITaskRepository(): ICGITaskRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseCGITaskRepository();
}

/**
 * 创建知识库 Repository
 */
export function createKnowledgeBaseRepository(): IKnowledgeBaseRepository {
  const cfg = getConfig();

  // 当前只支持 Supabase
  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseKnowledgeBaseRepository();
}

/**
 * 创建知识库默认绑定 Repository
 */
export function createKnowledgeBaseDefaultsRepository(): IKnowledgeBaseDefaultsRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseKnowledgeBaseDefaultsRepository();
}

/**
 * 创建文件夹 Repository
 */
export function createFolderRepository(): IFolderRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }
  
  return new SupabaseFolderRepository();
}

/**
 * 创建提示词工程配置 Repository
 */
export function createPromptEngineeringConfigRepository(): IPromptEngineeringConfigRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabasePromptEngineeringConfigRepository();
}

export function createProviderApiKeyRepository(): IProviderApiKeyRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseProviderApiKeyRepository();
}

export function createUserApiKeyRepository(): IUserApiKeyRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseUserApiKeyRepository();
}

export function createPublishedApiRepository(): IPublishedApiRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabasePublishedApiRepository();
}

export function createPublishedApiUsageRepository(): IPublishedApiUsageRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabasePublishedApiUsageRepository();
}

export function createSensitiveWordRepository(): ISensitiveWordRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseSensitiveWordRepository();
}

export function createModelConfigRepository(): IModelConfigRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseModelConfigRepository();
}

export function createUserReferenceImageRepository(): IUserReferenceImageRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseUserReferenceImageRepository();
}

export function createStorageObjectRepository(): IStorageObjectRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabaseStorageObjectRepository();
}

export function createPartnerRepository(): IPartnerRepository {
  const cfg = getConfig();

  if (cfg.adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器');
  }

  return new SupabasePartnerRepository();
}
