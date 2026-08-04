/**
 * skillPack 读写、锁定文件合并、从 unifiedTemplate 引导迁移
 */
import type { JsonSchemaV2 } from '../types';
import { buildContractReferenceMarkdown } from './contract-ref';
import {
  buildInvokeScriptSource,
  buildTextInvokeScriptSource,
} from './invoke-scripts';
import {
  CONTRACT_REF_PATH,
  SKILL_MD_PATH,
  SKILL_MODE_CORE,
  invokeScriptPath,
  isLockedSkillPath,
  type SkillPack,
  type SkillPackFile,
} from './types';

export function readSkillPack(extra: Record<string, unknown> | null | undefined): SkillPack | null {
  if (!extra || typeof extra !== 'object') return null;
  const raw = extra.skillPack;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const files = (raw as { files?: unknown }).files;
  if (!Array.isArray(files)) return null;
  const out: SkillPackFile[] = [];
  for (const f of files) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    const path = String((f as SkillPackFile).path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
    const content = typeof (f as SkillPackFile).content === 'string' ? (f as SkillPackFile).content : '';
    if (!path) continue;
    out.push({
      path,
      content,
      readonly: Boolean((f as SkillPackFile).readonly) || isLockedSkillPath(path),
    });
  }
  return { version: 1, files: out };
}

export function getSkillFile(pack: SkillPack, path: string): SkillPackFile | undefined {
  const p = String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  if (!p) return undefined;
  return pack.files.find((f) => f.path === p);
}

export function upsertSkillFile(pack: SkillPack, file: SkillPackFile): SkillPack {
  const path = file.path.replace(/\\/g, '/').replace(/^\.\//, '');
  const readonly = Boolean(file.readonly) || isLockedSkillPath(path);
  const next = pack.files.filter((f) => f.path !== path);
  next.push({ path, content: file.content, readonly });
  next.sort((a, b) => a.path.localeCompare(b.path));
  return { version: 1, files: next };
}

/**
 * 合并客户端提交的 skillPack：锁定路径以服务端权威内容为准。
 */
export function mergeSkillPackForSave(args: {
  incoming: SkillPack | null;
  previous: SkillPack | null;
  contractSchema?: JsonSchemaV2;
  scope: string;
  taskKey: string;
}): SkillPack {
  const base = args.previous ?? { version: 1 as const, files: [] };
  let pack = { version: 1 as const, files: [...base.files] };

  if (args.incoming) {
    for (const f of args.incoming.files) {
      const path = f.path.replace(/\\/g, '/').replace(/^\.\//, '');
      if (isLockedSkillPath(path)) continue;
      pack = upsertSkillFile(pack, { path, content: f.content, readonly: false });
    }
  }

  return ensureLockedSkillFiles({
    pack,
    contractSchema: args.contractSchema,
    scope: args.scope,
    taskKey: args.taskKey,
  });
}

function resolveInvokeTaskKey(scope: string, taskKey: string): 'generator' | 'group' | 'series' {
  const k = taskKey.trim();
  if (k === 'group' || k === 'series' || k === 'generator') return k;
  // 非三态 type（含 text）一律按单次 generator 解析 invoke
  if (scope === 'text') return 'generator';
  return 'generator';
}

/** 确保只读合同 ref + invoke script 存在且内容为平台生成 */
export function ensureLockedSkillFiles(args: {
  pack: SkillPack;
  contractSchema?: JsonSchemaV2;
  scope: string;
  taskKey: string;
}): SkillPack {
  let pack = args.pack;
  const contractMd = buildContractReferenceMarkdown(args.contractSchema);
  pack = upsertSkillFile(pack, {
    path: CONTRACT_REF_PATH,
    content: contractMd,
    readonly: true,
  });

  if (args.scope === 'text') {
    pack = upsertSkillFile(pack, {
      path: 'scripts/invoke-text.mjs',
      content: buildTextInvokeScriptSource(),
      readonly: true,
    });
  } else {
    const tk = resolveInvokeTaskKey(args.scope, args.taskKey);
    pack = upsertSkillFile(pack, {
      path: invokeScriptPath(tk),
      content: buildInvokeScriptSource(tk),
      readonly: true,
    });
  }
  return pack;
}

/** 若无 SKILL.md，用 unifiedTemplate / manuscript 种子 */
export function ensureSkillMdSeed(args: {
  pack: SkillPack;
  seedBody: string;
  name: string;
  description: string;
}): SkillPack {
  const existing = getSkillFile(args.pack, SKILL_MD_PATH);
  if (existing?.content?.trim()) return args.pack;
  const body = args.seedBody.trim() || 'Produce the deliverable for this business.';
  const content = [
    '---',
    `name: ${args.name}`,
    `description: ${args.description}`,
    'loadReferences:',
    `  - ${CONTRACT_REF_PATH}`,
    '---',
    '',
    body,
    '',
  ].join('\n');
  return upsertSkillFile(args.pack, { path: SKILL_MD_PATH, content, readonly: false });
}

export function hasCoreSkillMode(extra: Record<string, unknown> | null | undefined): boolean {
  if (!extra) return false;
  if (extra.skillMode === SKILL_MODE_CORE) return true;
  return readSkillPack(extra) != null && Boolean(getSkillFile(readSkillPack(extra)!, SKILL_MD_PATH)?.content?.trim());
}

export { SKILL_MODE_CORE };
export { SKILL_MD_PATH, CONTRACT_REF_PATH, invokeScriptPath, isLockedSkillPath } from './types';
export type { SkillPack, SkillPackFile, SkillMode } from './types';
