/**
 * Embedding Provider 工厂
 * 管理多个 embedding provider，支持自动选择和切换
 */

import type {
  EmbeddingProvider,
  EmbeddingProviderType,
  EmbeddingRequest,
  EmbeddingResponse,
} from './types';
import { DeerEmbeddingProvider } from './providers';

export class EmbeddingProviderFactory {
  private providers: Map<EmbeddingProviderType, EmbeddingProvider> = new Map();
  private providerInitializers: Map<EmbeddingProviderType, () => EmbeddingProvider> = new Map();
  private defaultProvider: EmbeddingProviderType;

  constructor() {
    // 注册 provider 初始化器
    this.providerInitializers.set('deer', () => {
      try {
        return DeerEmbeddingProvider.fromEnv();
      } catch (error) {
        throw new Error(
          `DeerEmbeddingProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // 从环境变量读取默认 provider
    const envDefaultProvider = process.env.EMBEDDING_PROVIDER?.toLowerCase() as
      | EmbeddingProviderType
      | undefined;

    // 设置默认 provider
    this.defaultProvider = envDefaultProvider || 'deer';

    console.log(
      `[EmbeddingProviderFactory] 默认 Embedding Provider: ${this.defaultProvider}`
    );
  }

  /**
   * 注册 provider
   */
  register(type: EmbeddingProviderType, provider: EmbeddingProvider): void {
    this.providers.set(type, provider);
  }

  /**
   * 获取 provider
   */
  get(type?: EmbeddingProviderType): EmbeddingProvider {
    const providerType = type || this.defaultProvider;

    // 如果已经初始化，直接返回
    let provider = this.providers.get(providerType);
    if (provider) {
      return provider;
    }

    // 延迟初始化
    const initializer = this.providerInitializers.get(providerType);
    if (!initializer) {
      throw new Error(`Embedding Provider "${providerType}" 未注册`);
    }

    try {
      provider = initializer();
      this.providers.set(providerType, provider);
      return provider;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Embedding Provider "${providerType}" 初始化失败: ${errorMessage}`);
    }
  }

  /**
   * 安全地获取 provider，如果初始化失败返回 null
   */
  tryGet(type?: EmbeddingProviderType): EmbeddingProvider | null {
    try {
      return this.get(type);
    } catch (error) {
      console.warn(`[EmbeddingProviderFactory] 获取 Provider "${type}" 失败:`, error);
      return null;
    }
  }

  /**
   * 获取默认 provider
   */
  getDefaultProvider(): EmbeddingProviderType {
    return this.defaultProvider;
  }

  /**
   * 根据模型名称自动选择 provider
   */
  getProviderForModel(modelName: string, preferredProvider?: EmbeddingProviderType): EmbeddingProvider {
    // 如果指定了 provider，先尝试使用
    if (preferredProvider) {
      const provider = this.tryGet(preferredProvider);
      if (provider && provider.supportsModel(modelName)) {
        return provider;
      }
    }

    // 尝试默认 provider
    const defaultProvider = this.tryGet();
    if (defaultProvider && defaultProvider.supportsModel(modelName)) {
      return defaultProvider;
    }

    // 遍历所有 provider，找到支持该模型的
    for (const [type, initializer] of this.providerInitializers.entries()) {
      if (type === preferredProvider || type === this.defaultProvider) {
        continue; // 已经尝试过了
      }

      const provider = this.tryGet(type);
      if (provider && provider.supportsModel(modelName)) {
        return provider;
      }
    }

    // 如果都找不到，使用默认 provider（让它自己处理错误）
    return this.get(preferredProvider);
  }

  /**
   * 生成 embedding（自动选择 provider）
   */
  async embed(
    request: EmbeddingRequest,
    providerType?: EmbeddingProviderType
  ): Promise<EmbeddingResponse> {
    const provider = request.model
      ? this.getProviderForModel(request.model, providerType)
      : this.get(providerType);

    return await provider.embed(request);
  }
}

// 导出单例
let _embeddingProviderFactoryInstance: EmbeddingProviderFactory | null = null;

function getEmbeddingProviderFactory(): EmbeddingProviderFactory {
  if (!_embeddingProviderFactoryInstance) {
    _embeddingProviderFactoryInstance = new EmbeddingProviderFactory();
  }
  return _embeddingProviderFactoryInstance;
}

// 使用 Proxy 实现延迟初始化
export const embeddingProviderFactory = new Proxy({} as EmbeddingProviderFactory, {
  get(target, prop) {
    return getEmbeddingProviderFactory()[prop as keyof EmbeddingProviderFactory];
  },
  set(target, prop, value) {
    (getEmbeddingProviderFactory() as any)[prop] = value;
    return true;
  },
});

// 导出类型和类
export * from './types';

