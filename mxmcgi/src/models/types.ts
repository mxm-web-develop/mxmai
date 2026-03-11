/**
 * 统一的模型能力描述类型
 *
 * 注意：
 * - scope 只覆盖对外暴露的业务域：graph / writing / audio / video
 * - provider 使用逻辑 provider 名（如 deer、deerapi、openai、google、qwen、volc、minimax 等）
 * - 具体到上游 API 的映射仍由各 Provider 客户端负责
 */

import type { GenerateResult, GenerateParams } from './providers';

export type ModelScope = 'graph' | 'writing' | 'audio' | 'video';

export interface ModelContext {
  userId?: string;
  taskId?: string;
  storeToMinio?: boolean;
  /**
   * 预留：传递调用链所需的额外信息（如 traceId、业务标签等）
   */
  [key: string]: any;
}

export interface ModelMeta {
  /** 上游真实模型名（例如官方 API 的 model 字符串） */
  upstreamName?: string;
  /** 计费价格（单价），单位由 currency 决定 */
  price?: number;
  /** 计费模式（例如 token_based/per_change_mode 等，与 suport-list 对齐） */
  chargeMode?: string;
  currency?: string;
  /** 对应官方 service（如 openai/google/anthropic/volc 等） */
  service?: string;
  /** 其他可选元数据 */
  [key: string]: any;
}

export interface ModelDefinition<
  P extends GenerateParams = GenerateParams,
  R extends GenerateResult = GenerateResult
> {
  /** 逻辑 provider 名，如 deer、deerapi、openai、google、qwen、volc 等 */
  provider: string;
  /** 业务域：graph / writing / audio / video */
  scope: ModelScope;
  /** 对外模型 key（与 suport-list 中的 key 对齐） */
  modelKey: string;
  /** 核心生成函数：由具体模型负责封装参数与调用上游 Provider */
  generate: (params: P, context?: ModelContext) => Promise<R>;
  /** 模型元信息（价格、计费方式、upstream 名等） */
  meta?: ModelMeta;
  /**
   * 可选：最小连通性测试，用于 Admin 中的“测试模型是否可用”
   * 实现时应尽量使用低成本参数，避免真实计费压力
   */
  testSample?: () => Promise<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  }>;
}

