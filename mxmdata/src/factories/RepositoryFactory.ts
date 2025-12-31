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
import type { ISmartflowRepository } from '../interfaces/ISmartflowRepository';
import type { ISmartflowExecutionRepository } from '../interfaces/ISmartflowExecutionRepository';
import type { IPromptTemplateRepository } from '../interfaces/IPromptTemplateRepository';
import type { ICGITaskRepository } from '../interfaces/ICGITaskRepository';
import type { IKnowledgeBaseRepository } from '../interfaces/IKnowledgeBaseRepository';
import { SupabaseUserRepository, SupabasePaymentRepository, SupabaseWalletRepository, SupabasePromptOptimizerRepository, SupabaseConversationRepository, SupabaseSmartflowRepository, SupabaseSmartflowExecutionRepository, SupabasePromptTemplateRepository, SupabaseCGITaskRepository, SupabaseKnowledgeBaseRepository, initSupabaseClient } from '../adapters/supabase';
import { MinIOStorageRepository, initMinIOClient } from '../adapters/minio';
import { loadDataConfig, type DataLayerConfig } from '../config/dataConfig';

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
 * 创建存储 Repository
 */
export function createStorageRepository(): IStorageRepository {
  const cfg = getConfig();
  return new MinIOStorageRepository();
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
   * 创建存储 Repository
   */
  static createStorageRepository(): IStorageRepository {
    return createStorageRepository();
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
   * 注意：此接口需要业务模块（如 mxmagent）实现具体的适配器
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

