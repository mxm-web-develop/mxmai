/**
 * 管道数据平面：从合同 claim 路径领取 → 迷你合同；产出按路径 commit 回 business。
 * @see docs/adr/pipeline-claim-commit.md
 */

export type ClaimableRoot = Record<string, unknown>;

function getByPath(root: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** 规范化 claim 路径：允许 basic.x / contract.basic.x / selection */
export function normalizeClaimPath(raw: string): string {
  let p = String(raw ?? '').trim();
  if (!p) return '';
  if (p.startsWith('contract.')) p = p.slice('contract.'.length);
  if (p.startsWith('state.contract.')) p = p.slice('state.contract.'.length);
  return p;
}

/**
 * 按路径从完整合同领取，组装迷你合同（只含被领到的区/字段）。
 */
export function claimContractSlice(
  contract: ClaimableRoot | null | undefined,
  claimPaths: string[]
): Record<string, unknown> {
  const mini: Record<string, unknown> = {
    meta:
      contract?.meta && typeof contract.meta === 'object'
        ? {
            scope: (contract.meta as Record<string, unknown>).scope,
            taskKey: (contract.meta as Record<string, unknown>).taskKey,
            subtype: (contract.meta as Record<string, unknown>).subtype,
            taskId: (contract.meta as Record<string, unknown>).taskId,
          }
        : {},
  };
  if (!contract || typeof contract !== 'object') return mini;

  const paths = claimPaths.map(normalizeClaimPath).filter(Boolean);
  for (const path of paths) {
    // 整区：basic / business / selection / assets / sources / enrich_search
    if (!path.includes('.')) {
      const v = contract[path];
      if (v !== undefined) mini[path] = v;
      continue;
    }
    const v = getByPath(contract, path);
    if (v === undefined) continue;
    setByPath(mini, path, v);
  }
  return mini;
}

/** 是否整包合同占位 */
export function isWholesaleContractMapping(tmpl: unknown): boolean {
  const s = String(tmpl ?? '').trim();
  return s === '${state.contract}' || s === '${contract}';
}

/**
 * 从 expert 产出 JSON 中只保留允许写回的键（裸键或 business.x）。
 */
export function filterCommitPayload(
  parsed: Record<string, unknown>,
  commitPaths: string[] | undefined | null
): Record<string, unknown> {
  if (!commitPaths || commitPaths.length === 0) return { ...parsed };
  const allow = new Set<string>();
  for (const raw of commitPaths) {
    let p = normalizeClaimPath(raw);
    if (p.startsWith('business.')) p = p.slice('business.'.length);
    if (p && !p.includes('.')) allow.add(p);
  }
  if (allow.size === 0) return { ...parsed };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (allow.has(k)) out[k] = v;
  }
  return out;
}

export function commitPathsFromFieldSpecs(fieldSpecs: unknown): string[] {
  if (!Array.isArray(fieldSpecs)) return [];
  const out: string[] = [];
  for (const it of fieldSpecs) {
    if (!it || typeof it !== 'object') continue;
    const name = String((it as { name?: unknown }).name ?? '').trim();
    if (name) out.push(name);
  }
  return out;
}

/** 系统级可联想路径（不依赖业务 schema） */
export const SYSTEM_CLAIM_PATH_SUGGESTIONS: { value: string; label: string; group: string }[] = [
  { value: 'selection', label: 'selection（选题剪枝结果）', group: '系统' },
  { value: 'selection.topics', label: 'selection.topics', group: '系统' },
  { value: 'assets', label: 'assets（挂卡/媒体摘要）', group: '系统' },
  { value: 'assets.cards', label: 'assets.cards', group: '系统' },
  { value: 'assets.media', label: 'assets.media', group: '系统' },
  { value: 'sources.websource', label: 'sources.websource（指针）', group: '系统' },
  { value: 'enrich_search.query', label: 'enrich_search.query', group: '系统' },
];

export const SYSTEM_EVIDENCE_KEY_SUGGESTIONS: { value: string; label: string }[] = [
  { value: 'websource', label: 'websource（发现/剪枝后）' },
  { value: 'enrich_result', label: 'enrich_result（深搜主结果）' },
  { value: 'enrich_supplement', label: 'enrich_supplement（补充搜）' },
  { value: 'enrich_result_side', label: 'enrich_result_side（副线轻搜）' },
];
