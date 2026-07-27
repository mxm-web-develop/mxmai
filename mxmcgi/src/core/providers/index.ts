/**
 * Provider 工厂和统一接口
 */

import { ModelProvider, ProviderType, GenerateParams, GenerateResult } from './types';
import { ReplicateProvider } from '../../models/replicate/provider';
import { PPIOProvider } from '../../models/ppio/provider';
import { DeerProvider } from '../../models/deerapi/provider';
import { OpenAIProvider } from '../../models/openai/provider';
import { GoogleProvider } from '../../models/google/provider';
import { AnthropicProvider } from '../../models/anthropic/provider';
import { QwenProvider } from '../../models/qwen/provider';
import { VolcProvider } from '../../models/volc/provider';
import { MinimaxProvider } from '../../models/minimax/provider';
import { AtlasCloudProvider } from '../../models/atlascloud/provider';
import { MaxplanProvider } from '../../models/maxplan/provider';
import { resolveDefaultLlmProvider, resolveDefaultLlmModel } from '../../config/default-llm';
import { OpenRouterProvider } from '../../models/openrouter/provider';
import { QhaiProvider } from '../../models/qhai/provider';
import { JiekouProvider } from '../../models/jiekou/provider';
import { getResolvedRouting } from './model-routing';
import {
  loadProviderModelCatalog,
  getEnabledForMerge,
} from '../../models/provider-model-catalog';

/**
 * 模型到提供商的映射表
 * 记录每个模型被哪些提供商支持
 */
type ModelProviderMap = Record<string, ProviderType[]>;

/**
 * 纯动态模式：modelProviderMap 的权威来源是 DB 的 provider_models。
 * 启动后由 ProviderFactory.loadProviderCatalog() 合并 DB 模型。
 */

export class ProviderFactory {
  private providers: Map<ProviderType, ModelProvider> = new Map();
  private providerInitializers: Map<ProviderType, () => ModelProvider> = new Map();
  private modelProviderMap: ModelProviderMap;
  private defaultProvider: ProviderType;

  constructor() {
    // 注册 provider 初始化器（延迟初始化，支持初始化失败）
    this.providerInitializers.set('replicate', () => {
      try {
        return new ReplicateProvider();
      } catch (error) {
        throw new Error(`ReplicateProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    this.providerInitializers.set('ppio', () => {
      try {
        return new PPIOProvider();
      } catch (error) {
        // PPIO provider 可能因为缺少依赖而无法初始化，这是正常的
        throw new Error(`PPIOProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    this.providerInitializers.set('deer', () => {
      try {
        return new DeerProvider();
      } catch (error) {
        // Deer provider 可能因为缺少依赖而无法初始化，这是正常的
        throw new Error(`DeerProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('openai', () => {
      try {
        return new OpenAIProvider();
      } catch (error) {
        throw new Error(`OpenAIProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('google', () => {
      try {
        return new GoogleProvider();
      } catch (error) {
        throw new Error(`GoogleProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('anthropic', () => {
      try {
        return new AnthropicProvider();
      } catch (error) {
        throw new Error(`AnthropicProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('qwen', () => {
      try {
        return new QwenProvider();
      } catch (error) {
        throw new Error(`QwenProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('volc', () => {
      try {
        return new VolcProvider();
      } catch (error) {
        throw new Error(`VolcProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('minimax', () => {
      try {
        return new MinimaxProvider();
      } catch (error) {
        throw new Error(`MinimaxProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('atlascloud', () => {
      try {
        return new AtlasCloudProvider();
      } catch (error) {
        throw new Error(`AtlasCloudProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('maxplan', () => {
      try {
        return new MaxplanProvider();
      } catch (error) {
        throw new Error(`MaxplanProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('openrouter', () => {
      try {
        return new OpenRouterProvider();
      } catch (error) {
        throw new Error(`OpenRouterProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('qhai', () => {
      try {
        return new QhaiProvider();
      } catch (error) {
        throw new Error(`QhaiProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('jiekou', () => {
      try {
        return new JiekouProvider();
      } catch (error) {
        throw new Error(`JiekouProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.providerInitializers.set('mcp', () => {
      try {
        const { McpVisionProvider } = require('./mcp/vision-provider');
        return new McpVisionProvider();
      } catch (error) {
        throw new Error(`McpVisionProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    // 纯动态模式：初始为空，启动后 loadProviderCatalog() 从 DB 合并
    this.modelProviderMap = {};
    
    // 从环境变量读取默认提供商（未设置时 maxplan，不用 replicate）
    const envDefaultProvider = process.env.DEFAULT_PROVIDER?.toLowerCase();

    // 支持 'deerapi' -> 'deer' 的映射
    if (envDefaultProvider === 'deerapi') {
      this.defaultProvider = 'deer';
    } else if (
      envDefaultProvider === 'replicate' ||
      envDefaultProvider === 'ppio' ||
      envDefaultProvider === 'deer' ||
      envDefaultProvider === 'openai' ||
      envDefaultProvider === 'google' ||
      envDefaultProvider === 'anthropic' ||
      envDefaultProvider === 'qwen' ||
      envDefaultProvider === 'volc' ||
      envDefaultProvider === 'minimax' ||
      envDefaultProvider === 'atlascloud' ||
      envDefaultProvider === 'maxplan' ||
      envDefaultProvider === 'openrouter' ||
      envDefaultProvider === 'qhai' ||
      envDefaultProvider === 'jiekou' ||
      envDefaultProvider === 'mcp'
    ) {
      this.defaultProvider = envDefaultProvider;
    } else {
      this.defaultProvider = resolveDefaultLlmProvider();
      if (!envDefaultProvider) {
        console.log(
          `[ProviderFactory] DEFAULT_PROVIDER 未设置，使用默认值: ${this.defaultProvider}（模型: ${resolveDefaultLlmModel()}）`
        );
      } else {
        console.warn(
          `[ProviderFactory] DEFAULT_PROVIDER="${envDefaultProvider}" 无效，回退: ${this.defaultProvider}`
        );
      }
    }
  }

  register(type: ProviderType, provider: ModelProvider): void {
    this.providers.set(type, provider);
  }

  get(type: ProviderType): ModelProvider {
    // 如果已经初始化，直接返回
    let provider = this.providers.get(type);
    if (provider) {
      return provider;
    }

    // 延迟初始化：只有在需要时才创建 provider
    const initializer = this.providerInitializers.get(type);
    if (!initializer) {
      throw new Error(`Provider "${type}" 未注册`);
    }

    try {
      provider = initializer();
      this.providers.set(type, provider);
      return provider;
    } catch (error) {
      // 如果初始化失败，抛出错误（调用者需要处理）
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Provider "${type}" 初始化失败: ${errorMessage}`);
    }
  }
  
  /**
   * 安全地获取 provider，如果初始化失败返回 null
   */
  tryGet(type: ProviderType): ModelProvider | null {
    try {
      return this.get(type);
    } catch (error) {
      return null;
    }
  }

  /**
   * 根据逻辑模型名或物理模型名解析出 Provider 与物理模型名
   * 若路由表中有该逻辑名，使用路由的 provider + model；否则将名称视为物理模型名，由 getProviderForModel 选 provider
   */
  getProviderAndModel(logicalOrPhysicalName: string, preferredProvider?: ProviderType): { provider: ModelProvider; model: string } {
    const resolved = getResolvedRouting(logicalOrPhysicalName, preferredProvider);
    if (resolved.fromRouting) {
      const provider = this.get(resolved.provider);
      if (provider.supportsModel(resolved.model)) {
        return { provider, model: resolved.model };
      }
      // 路由指向的 provider 不支持该 model，回退为按物理模型选择
    }
    // 未命中路由：logicalOrPhysicalName 视为物理模型名，provider 仅由调用方 preferredProvider 决定
    const provider = this.getProviderForModel(resolved.model, preferredProvider);
    return { provider, model: resolved.model };
  }

  /**
   * 获取支持指定模型的 provider
   * 
   * 选择逻辑：
   * 1. 如果指定了 preferredProvider，优先使用（如果支持该模型）
   * 2. 如果模型只有一个提供商支持，自动使用该提供商
   * 3. 如果多个提供商支持，优先使用 DEFAULT_PROVIDER
   * 4. 如果 DEFAULT_PROVIDER 不支持，尝试其他提供商
   * 
   * @param modelName 模型名称
   * @param preferredProvider 首选的提供商（可选）
   * @returns 支持该模型的 ModelProvider
   */
  getProviderForModel(modelName: string, preferredProvider?: ProviderType): ModelProvider {
    // 始终输出调试日志（便于排查问题）
    console.log(`[ProviderFactory] getProviderForModel: modelName=${modelName}, preferredProvider=${preferredProvider || '(未指定)'}, defaultProvider=${this.defaultProvider}`);
    
    // 如果指定了 provider，先检查是否支持
    if (preferredProvider) {
      try {
        const provider = this.get(preferredProvider);
        if (provider.supportsModel(modelName)) {
          if (process.env.DEBUG_PROVIDER_FACTORY) {
            console.log(`[ProviderFactory] 使用指定的 provider: ${preferredProvider}`);
          }
          return provider;
        }
        // 如果指定的 provider 不支持，继续下面的自动选择逻辑
        console.warn(`⚠️  Provider "${preferredProvider}" 不支持模型 "${modelName}"，将自动选择其他提供商`);
      } catch (error) {
        // Provider 初始化失败，继续下面的自动选择逻辑
        console.warn(`⚠️  Provider "${preferredProvider}" 初始化失败，将自动选择其他提供商: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 获取支持该模型的所有提供商
    const supportedProviders = this.modelProviderMap[modelName] || [];
    
    // 始终输出调试日志（便于排查问题）
    console.log(`[ProviderFactory] 模型 "${modelName}" 支持的提供商: ${supportedProviders.join(', ') || '(无，将动态检查)'}`);
    
    if (supportedProviders.length === 0) {
      // 模型不在映射表中，尝试动态检查所有 provider
      return this.findProviderByChecking(modelName);
    }

    // 如果只有一个提供商支持，自动使用该提供商
    if (supportedProviders.length === 1) {
      const singleProvider = supportedProviders[0];
      const provider = this.tryGet(singleProvider);
      if (provider && provider.supportsModel(modelName)) {
        console.log(`✅ 模型 "${modelName}" 只有一个提供商支持，自动使用: ${singleProvider}`);
        return provider;
      }
      // 如果唯一的 provider 不可用，抛出错误
      throw new Error(`模型 "${modelName}" 的唯一提供商 "${singleProvider}" 不可用（可能缺少依赖或配置）`);
    }

    // 多个提供商支持，优先使用默认提供商
    console.log(`[ProviderFactory] 检查默认提供商: defaultProvider=${this.defaultProvider}, supportedProviders=${supportedProviders.join(', ')}, 是否包含默认提供商=${supportedProviders.includes(this.defaultProvider)}`);
    
    if (supportedProviders.includes(this.defaultProvider)) {
      const defaultProviderInstance = this.tryGet(this.defaultProvider);
      console.log(`[ProviderFactory] 默认提供商实例: ${defaultProviderInstance ? '存在' : 'null'}`);
      
      if (defaultProviderInstance) {
        const supportsModel = defaultProviderInstance.supportsModel(modelName);
        console.log(`[ProviderFactory] 默认提供商是否支持模型: ${supportsModel}`);
        
        if (supportsModel) {
          console.log(`✅ 使用默认提供商 "${this.defaultProvider}" 调用模型 "${modelName}"`);
          return defaultProviderInstance;
        } else {
          console.warn(`⚠️  默认提供商 "${this.defaultProvider}" 不支持模型 "${modelName}"，尝试其他提供商`);
        }
      } else {
        console.warn(`⚠️  默认提供商 "${this.defaultProvider}" 初始化失败，尝试其他提供商`);
      }
    } else {
      console.warn(`⚠️  默认提供商 "${this.defaultProvider}" 不在模型 "${modelName}" 的支持列表中 [${supportedProviders.join(', ')}]，尝试其他提供商`);
    }

    // 默认提供商不支持或不可用，尝试其他提供商
    console.log(`[ProviderFactory] 开始尝试其他提供商，支持的提供商列表: ${supportedProviders.join(', ')}`);
    for (const providerType of supportedProviders) {
      if (providerType !== this.defaultProvider) {
        console.log(`[ProviderFactory] 尝试提供商: ${providerType}`);
        const provider = this.tryGet(providerType);
        if (provider) {
          const supportsModel = provider.supportsModel(modelName);
          console.log(`[ProviderFactory] 提供商 ${providerType} 实例存在，是否支持模型: ${supportsModel}`);
          if (supportsModel) {
            console.log(`✅ 使用提供商 "${providerType}" 调用模型 "${modelName}"`);
            return provider;
          }
        } else {
          console.log(`[ProviderFactory] 提供商 ${providerType} 实例不存在（初始化失败）`);
        }
        // 该 provider 不可用，继续尝试下一个
      } else {
        console.log(`[ProviderFactory] 跳过默认提供商 ${providerType}（已在上面尝试过）`);
      }
    }

    throw new Error(`没有找到支持模型 "${modelName}" 的可用 provider（支持的提供商: ${supportedProviders.join(', ')})`);
    }

  /**
   * 通过动态检查所有 provider 来查找支持指定模型的 provider
   * 用于处理不在映射表中的新模型
   */
  private findProviderByChecking(modelName: string): ModelProvider {
    // 按优先级顺序检查：默认提供商 -> 其他提供商
    const checkOrder: ProviderType[] = [this.defaultProvider];
    for (const [type] of this.providerInitializers.entries()) {
      if (type !== this.defaultProvider) {
        checkOrder.push(type);
      }
    }

    for (const providerType of checkOrder) {
      const provider = this.tryGet(providerType);
      if (provider && provider.supportsModel(modelName)) {
        console.log(`✅ 动态发现模型 "${modelName}" 由提供商 "${providerType}" 支持`);
        // 更新映射表以便下次使用
        if (!this.modelProviderMap[modelName]) {
          this.modelProviderMap[modelName] = [];
        }
        if (!this.modelProviderMap[modelName].includes(providerType)) {
          this.modelProviderMap[modelName].push(providerType);
        }
        return provider;
      }
          // 该 provider 不可用，继续尝试下一个
    }

    throw new Error(`没有找到支持模型 "${modelName}" 的可用 provider`);
  }

  /**
   * 获取默认提供商
   */
  getDefaultProvider(): ProviderType {
    return this.defaultProvider;
  }

  /**
   * 获取支持指定模型的所有提供商列表
   */
  getSupportedProviders(modelName: string): ProviderType[] {
    return this.modelProviderMap[modelName] || [];
  }

  /**
   * 将 DB 中的 provider_models 合并到 modelProviderMap
   */
  mergeDbModels(entries: { provider: ProviderType; model_key: string }[]): void {
    for (const { provider, model_key } of entries) {
      if (!this.modelProviderMap[model_key]) {
        this.modelProviderMap[model_key] = [];
      }
      if (!this.modelProviderMap[model_key].includes(provider)) {
        this.modelProviderMap[model_key].push(provider);
      }
    }
    console.log(
      `[ProviderFactory] 已合并 ${entries.length} 个 DB 模型到 modelProviderMap`
    );
  }

  /**
   * 从 provider_models 表加载启用模型并合并到 modelProviderMap
   */
  async loadProviderCatalog(): Promise<void> {
    await loadProviderModelCatalog();
    const entries = getEnabledForMerge();
    this.mergeDbModels(entries);
  }

  /** ProviderFactory 已注册的 provider 类型（与 registered-provider-types 一致） */
  listRegisteredProviderTypes(): ProviderType[] {
    return Array.from(this.providerInitializers.keys());
  }
}

// 导出单例（延迟初始化，确保环境变量已加载）
let _providerFactoryInstance: ProviderFactory | null = null;

function getProviderFactory(): ProviderFactory {
  if (!_providerFactoryInstance) {
    // 如果环境变量还没有加载，尝试加载
    if (!process.env.DEFAULT_PROVIDER) {
      try {
        const { loadMonorepoEnv } = require('@mxmai/mxmdata') as typeof import('@mxmai/mxmdata');
        loadMonorepoEnv({ service: 'mxmcgi', warnLegacy: false });
      } catch {
        // 忽略错误，可能已经加载过了
      }
    }
    
    _providerFactoryInstance = new ProviderFactory();
  }
  return _providerFactoryInstance;
}

// 使用 Proxy 实现延迟初始化
export const providerFactory = new Proxy({} as ProviderFactory, {
  get(target, prop) {
    return getProviderFactory()[prop as keyof ProviderFactory];
  },
  set(target, prop, value) {
    (getProviderFactory() as any)[prop] = value;
    return true;
  },
});

// 导出类型和类
export * from './types';
export { ReplicateProvider, PPIOProvider, DeerProvider, OpenAIProvider, OpenRouterProvider, GoogleProvider, AnthropicProvider, QwenProvider, VolcProvider, MinimaxProvider };
export {
  getResolvedRouting,
  getFullRoutingTable,
  setRoutingOverride,
  clearRoutingOverride,
  clearAllOverrides,
  defaultRouting,
} from './model-routing';
export type { RoutingEntry } from './model-routing';
export { recordStats, getProviderStats } from './provider-stats';
export type { ProviderStatsRecord, ProviderStatsAggregate } from './provider-stats';
export { getProviderKeys, getDeerProviderKeys, getFirstProviderKey } from './provider-keys';
export type { ProviderKeyKind, OfficialService } from './provider-keys';
export {
  REGISTERED_PROVIDER_TYPES,
  BILLING_CAPABLE_PROVIDER_TYPES,
  isRegisteredProviderType,
} from './registered-provider-types';
