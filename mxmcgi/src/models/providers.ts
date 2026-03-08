/**
 * 统一从 src/models 暴露 provider 能力，供 task、routes、writing、graph 等使用。
 * 实现仍在 core/providers，此处仅做 re-export。
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
} from '../core/providers';
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
} from '../core/providers';
