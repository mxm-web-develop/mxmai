/**
 * Embedding Provider 工厂
 * 默认走 knowledge catalog（provider_models + knowledge_scope_config）
 */

import type {
  EmbeddingProvider,
  EmbeddingProviderType,
  EmbeddingRequest,
  EmbeddingResponse,
} from './types';
import { embedViaKnowledgeCatalog } from './catalog-embed';
import { DeerEmbeddingProvider } from './providers';

/** Catalog 路由：不绑定单一 provider 类型 */
class CatalogEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'custom' as EmbeddingProviderType;
  readonly name = 'Knowledge Catalog Embedding';

  supportsModel(_modelName: string): boolean {
    return true;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return embedViaKnowledgeCatalog(request, request.model);
  }
}

export class EmbeddingProviderFactory {
  private providers: Map<EmbeddingProviderType, EmbeddingProvider> = new Map();
  private providerInitializers: Map<EmbeddingProviderType, () => EmbeddingProvider> = new Map();
  private defaultProvider: EmbeddingProviderType;
  private catalogProvider = new CatalogEmbeddingProvider();

  constructor() {
    this.providerInitializers.set('deer', () => {
      try {
        return DeerEmbeddingProvider.fromEnv();
      } catch (error) {
        throw new Error(
          `DeerEmbeddingProvider 初始化失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    const envDefaultProvider = process.env.EMBEDDING_PROVIDER?.toLowerCase() as
      | EmbeddingProviderType
      | undefined;

    // 未显式指定 deer 时，默认走 catalog（Admin 可配置）
    this.defaultProvider =
      envDefaultProvider === 'deer' ? 'deer' : (envDefaultProvider as EmbeddingProviderType) || 'custom';

    console.log(
      `[EmbeddingProviderFactory] 默认 Embedding 路由: ${this.defaultProvider === 'custom' ? 'knowledge-catalog' : this.defaultProvider}`
    );
  }

  register(type: EmbeddingProviderType, provider: EmbeddingProvider): void {
    this.providers.set(type, provider);
  }

  get(type?: EmbeddingProviderType): EmbeddingProvider {
    const providerType = type || this.defaultProvider;

    if (providerType === 'custom') {
      return this.catalogProvider;
    }

    let provider = this.providers.get(providerType);
    if (provider) {
      return provider;
    }

    const initializer = this.providerInitializers.get(providerType);
    if (!initializer) {
      return this.catalogProvider;
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

  tryGet(type?: EmbeddingProviderType): EmbeddingProvider | null {
    try {
      return this.get(type);
    } catch (error) {
      console.warn(`[EmbeddingProviderFactory] 获取 Provider "${type}" 失败:`, error);
      return null;
    }
  }

  getDefaultProvider(): EmbeddingProviderType {
    return this.defaultProvider;
  }

  getProviderForModel(modelName: string, preferredProvider?: EmbeddingProviderType): EmbeddingProvider {
    if (preferredProvider === 'deer') {
      const provider = this.tryGet('deer');
      if (provider?.supportsModel(modelName)) {
        return provider;
      }
    }
    return this.catalogProvider;
  }

  async embed(
    request: EmbeddingRequest,
    providerType?: EmbeddingProviderType
  ): Promise<EmbeddingResponse> {
    if (providerType === 'deer') {
      return this.get('deer').embed(request);
    }
    return embedViaKnowledgeCatalog(request, request.model);
  }
}

let _embeddingProviderFactoryInstance: EmbeddingProviderFactory | null = null;

function getEmbeddingProviderFactory(): EmbeddingProviderFactory {
  if (!_embeddingProviderFactoryInstance) {
    _embeddingProviderFactoryInstance = new EmbeddingProviderFactory();
  }
  return _embeddingProviderFactoryInstance;
}

export const embeddingProviderFactory = new Proxy({} as EmbeddingProviderFactory, {
  get(_target, prop) {
    return getEmbeddingProviderFactory()[prop as keyof EmbeddingProviderFactory];
  },
  set(_target, prop, value) {
    (getEmbeddingProviderFactory() as any)[prop] = value;
    return true;
  },
});

export * from './types';
