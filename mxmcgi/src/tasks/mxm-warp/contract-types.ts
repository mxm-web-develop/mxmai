/**
 * mxm-warp 运行时合同类型（对齐 docs/mxm-warp-v2-对齐记录.md）
 */

export const MXM_WARP_CONTRACT_VERSION = '1';

export type MxmWarpShape = 'unit' | 'series';

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
