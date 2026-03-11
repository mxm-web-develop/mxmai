/**
 * Provider 能力与类型的统一出口。
 *
 * 约定：
 * - 其他模块一律从 `models/providers` 引用 Provider 相关类型与函数
 * - 内部目前仍复用 `core/providers` 实现，后续如果物理位置迁移，只需要改这一层
 */
export {
  providerFactory,
  getResolvedRouting,
  getFullRoutingTable,
  setRoutingOverride,
  clearRoutingOverride,
  clearAllOverrides,
  defaultRouting,
  recordStats,
  getProviderStats,
  getProviderKeys,
  getFirstProviderKey,
} from './providers-inner';
export type {
  ProviderType,
  GenerateParams,
  GenerateResult,
  ModelProvider,
  RoutingEntry,
  ProviderStatsRecord,
  ProviderStatsAggregate,
  ProviderKeyKind,
  OfficialService,
} from './providers-inner';
