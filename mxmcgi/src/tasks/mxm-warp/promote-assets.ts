/**
 * Core Skill / Warp 数据平面：把表单挂卡与参考媒体从 params 提升到 contract.assets
 *
 * 两平面约定：
 * - 文本平面：skill 读 contract（含 assets 摘要）拼 LLM
 * - 媒体平面：Provider 仍读 params.referenceImage / 各 referenceImages 槽（像素通路不变）
 */
import type { JsonSchemaV2, TaskContext } from '../types';
import type { MxmWarpContract } from './contract-types';
import { getContract, withContract } from './input-stage';

/** 挂卡 / 解析结果写入 params 的键 → 进入 contract.assets.cards */
export const CONTRACT_ASSET_CARD_KEYS = [
  'writing_summary',
  'style_summary',
  'style_exemplar_hints',
  'character_brief',
  'appearance_prompt',
  'kb_recall_block',
  'host_portrait',
] as const;

/** 媒体 URL / 参考图相关（摘要进 assets.media；完整像素仍走 params） */
export const CONTRACT_ASSET_MEDIA_KEYS = [
  'style_ref_images',
  'character_ref_images',
  'referenceImage',
] as const;

/** 文件夹 id（可追溯，体积小） */
export const CONTRACT_ASSET_FOLDER_KEYS = [
  'writing_folder_id',
  'style_folder_id',
  'character_folder_id',
  'knowledge_folder_id',
] as const;

const TEXT_MAX = 4000;
const LIST_MAX = 24;

function truncateText(v: unknown, max = TEXT_MAX): unknown {
  if (typeof v !== 'string') return v;
  if (v.length <= max) return v;
  return `${v.slice(0, max)}\n…[truncated]`;
}

function summarizeMediaList(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const items = v.slice(0, LIST_MAX).map((row) => {
    if (typeof row === 'string') return { url: row };
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const o = row as Record<string, unknown>;
      const content = o.content ?? o.url ?? o.src;
      return {
        ...(typeof content === 'string' ? { url: content } : {}),
        ...(typeof o.groupKey === 'string' ? { groupKey: o.groupKey } : {}),
        ...(typeof o.groupTitle === 'string' ? { groupTitle: o.groupTitle } : {}),
        ...(typeof o.mime === 'string' ? { mime: o.mime } : {}),
      };
    }
    return row;
  });
  return {
    count: v.length,
    items,
    truncated: v.length > LIST_MAX,
  };
}

function collectReferenceImageSlots(
  schema: JsonSchemaV2 | undefined,
  params: Record<string, unknown>
): Record<string, unknown> {
  const props = schema?.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const out: Record<string, unknown> = {};
  for (const [name, defRaw] of Object.entries(props as Record<string, unknown>)) {
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    if (def['x-ui-type'] !== 'referenceImages') continue;
    if (!Object.prototype.hasOwnProperty.call(params, name)) continue;
    const title = typeof def.title === 'string' && def.title.trim() ? def.title.trim() : name;
    const description =
      typeof def.description === 'string' && def.description.trim() ? def.description.trim() : undefined;
    out[name] = {
      role: name,
      title,
      ...(description ? { description } : {}),
      purpose: description || title,
      ...((summarizeMediaList(params[name]) as object) ?? {}),
    };
  }
  return out;
}

export type ContractAssetsPayload = {
  cards: Record<string, unknown>;
  media: Record<string, unknown>;
  folders: Record<string, unknown>;
};

/** 从 params（+ schema 参考图槽）组装 assets 载荷 */
export function buildContractAssetsFromParams(
  params: Record<string, unknown>,
  schema?: JsonSchemaV2
): ContractAssetsPayload {
  const cards: Record<string, unknown> = {};
  for (const k of CONTRACT_ASSET_CARD_KEYS) {
    const v = params[k];
    if (v == null || v === '') continue;
    cards[k] = truncateText(v);
  }

  const media: Record<string, unknown> = {
    ...collectReferenceImageSlots(schema, params),
  };
  for (const k of CONTRACT_ASSET_MEDIA_KEYS) {
    const v = params[k];
    if (v == null || v === '') continue;
    media[k] = Array.isArray(v) ? summarizeMediaList(v) : truncateText(v, 2000);
  }

  const folders: Record<string, unknown> = {};
  for (const k of CONTRACT_ASSET_FOLDER_KEYS) {
    const v = params[k];
    if (typeof v === 'string' && v.trim()) folders[k] = v.trim();
  }

  return { cards, media, folders };
}

function isEmptyAssets(a: ContractAssetsPayload): boolean {
  return (
    Object.keys(a.cards).length === 0 &&
    Object.keys(a.media).length === 0 &&
    Object.keys(a.folders).length === 0
  );
}

/**
 * 将挂卡/参考媒体写入 contract.assets（合并已有 assets，不覆盖 enrich 写入的其它键）。
 */
export function promoteParamsAssetsToContract(
  ctx: TaskContext,
  schema?: JsonSchemaV2
): TaskContext {
  const built = buildContractAssetsFromParams(ctx.params ?? {}, schema);
  if (isEmptyAssets(built)) return ctx;

  const prior = getContract(ctx);
  if (!prior) return ctx;

  const prevAssets =
    prior.assets && typeof prior.assets === 'object' && !Array.isArray(prior.assets)
      ? { ...prior.assets }
      : {};

  const prevCards =
    prevAssets.cards && typeof prevAssets.cards === 'object' && !Array.isArray(prevAssets.cards)
      ? { ...(prevAssets.cards as Record<string, unknown>) }
      : {};
  const prevMedia =
    prevAssets.media && typeof prevAssets.media === 'object' && !Array.isArray(prevAssets.media)
      ? { ...(prevAssets.media as Record<string, unknown>) }
      : {};
  const prevFolders =
    prevAssets.folders &&
    typeof prevAssets.folders === 'object' &&
    !Array.isArray(prevAssets.folders)
      ? { ...(prevAssets.folders as Record<string, unknown>) }
      : {};

  const next: MxmWarpContract = {
    ...prior,
    assets: {
      ...prevAssets,
      cards: { ...prevCards, ...built.cards },
      media: { ...prevMedia, ...built.media },
      folders: { ...prevFolders, ...built.folders },
    },
  };
  return withContract(ctx, next);
}
