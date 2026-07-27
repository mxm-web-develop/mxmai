/**
 * mxm-warp 运行时合同类型（对齐 docs/mxm-warp-v2-对齐记录.md）
 */

export const MXM_WARP_CONTRACT_VERSION = '1';

/** 与非 text scope 的 taskKey 三态一致：单件对象 / 并发数组 / 历史连续 */
export type MxmWarpShape = 'generator' | 'group' | 'series';

export interface MxmWarpContractMeta {
  version: string;
  scope: string;
  taskKey: string;
  subtype: string | null;
  taskId: string;
  label?: string;
}

export interface MxmWarpEnrichSearch {
  /** 检索方式 / 待检索内容等（由 input 写入；形状由平台约定，节点专题再细） */
  [key: string]: unknown;
  result?: unknown;
  /** entityDive 步骤写入：人/公司/产品/事件实体 + 跨 Providers 深扒结果 */
  entity_dive?: EntityDivePayload;
}

export type EntityDiveKind = 'person' | 'company' | 'product' | 'event' | 'other';

export interface EntityDiveEntity {
  name: string;
  kind: EntityDiveKind;
  /** 业务/上下文中的角色或含义 */
  role?: string;
}

export interface EntityDiveEvidence {
  query: string;
  provider: string;
  hits: Array<{
    title: string;
    url: string;
    snippet?: string;
    domain?: string;
  }>;
  /** 命中内容摘要（AnySearch / LLM 总结） */
  summary?: string;
  keyPoints?: string[];
}

export interface EntityDiveRecord {
  entity: EntityDiveEntity;
  status: 'ok' | 'low_quality' | 'no_result';
  evidences: EntityDiveEvidence[];
}

export interface EntityDivePayload {
  /** 抽取的实体列表（去重后） */
  entities: EntityDiveEntity[];
  /** 每个实体的深扒结果 */
  records: EntityDiveRecord[];
  /** 派生过程日志：哪些 LLM 调用、用了哪些 query，便于排错 */
  diagnostics?: {
    extractionModel?: string;
    queriesGenerated: number;
    providers: string[];
    elapsedMs?: number;
  };
  /** 时间戳 */
  generatedAt?: string;
}

export interface MxmWarpSources {
  /** pre 网络检索结果 */
  websource?: unknown;
  [key: string]: unknown;
}

export interface MxmWarpContract {
  meta: MxmWarpContractMeta;
  basic: Record<string, unknown>;
  business: Record<string, unknown>;
  sources: MxmWarpSources;
  assets: Record<string, unknown>;
  enrich_search: MxmWarpEnrichSearch;
}

export type XZone = 'basic' | 'business';

export function emptyContract(meta: MxmWarpContractMeta): MxmWarpContract {
  return {
    meta: { ...meta, version: meta.version || MXM_WARP_CONTRACT_VERSION },
    basic: {},
    business: {},
    sources: {},
    assets: {},
    enrich_search: {},
  };
}
