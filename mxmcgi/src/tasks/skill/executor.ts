/**
 * Core Skill executor：output / text 共用
 */
import type { TaskContext } from '../types';
import type { WarpLlmFn } from '../mxm-warp/input-stage';
import { promoteParamsAssetsToContract } from '../mxm-warp/promote-assets';
import { buildSkillLlmMessages } from './context';
import { getSkillFile, hasCoreSkillMode, readSkillPack } from './pack';
import { parseSkillMd } from './parse';
import { SKILL_MD_PATH, type SkillPack } from './types';
import { assertCleanWritingManuscript } from '../llm-output-hygiene';

export function resolveSkillPackFromTemplateExtra(
  templateExtra: Record<string, unknown> | null | undefined
): SkillPack | null {
  if (!hasCoreSkillMode(templateExtra ?? null)) return null;
  return readSkillPack(templateExtra ?? null);
}

/** 取 SKILL.md 正文（不含 references） */
export function readSkillBodyFromPack(pack: SkillPack): string {
  const f = getSkillFile(pack, SKILL_MD_PATH);
  if (!f?.content?.trim()) return '';
  return parseSkillMd(f.content).body.trim();
}

/**
 * 组装完整 system（SKILL body + loadReferences），供 group itemManuscript / 兼容路径使用。
 * 不调用 LLM；contractOverride 仅用于绑定 inputs（可传空对象）。
 */
export function composeSkillSystemFromPack(args: {
  pack: SkillPack;
  ctx?: TaskContext;
  contractOverride?: Record<string, unknown> | null;
}): string {
  let ctx: TaskContext = args.ctx ?? {
    scope: 'writing',
    taskKey: 'group',
    taskId: 'skill-compose',
    params: {},
    state: { contract: args.contractOverride ?? {} },
  };
  ctx = promoteParamsAssetsToContract(ctx);
  // override 若缺 assets，用提升后的合同 assets 补上
  let override = args.contractOverride ?? (ctx.state.contract as Record<string, unknown>);
  if (override && typeof override === 'object') {
    const promoted = ctx.state.contract as Record<string, unknown> | undefined;
    const promotedAssets = promoted?.assets;
    const hasOverrideAssets =
      override.assets &&
      typeof override.assets === 'object' &&
      Object.keys(override.assets as object).length > 0;
    if (!hasOverrideAssets && promotedAssets) {
      override = { ...override, assets: promotedAssets };
    }
  }
  const { system } = buildSkillLlmMessages({
    pack: args.pack,
    ctx,
    contractOverride: override,
  });
  return system;
}

export async function runOutputSkillStage(args: {
  ctx: TaskContext;
  pack: SkillPack;
  llm: WarpLlmFn;
  contractOverride?: Record<string, unknown> | null;
}): Promise<TaskContext> {
  const ctx = promoteParamsAssetsToContract(args.ctx);
  let override = args.contractOverride;
  if (override && typeof override === 'object') {
    const promoted = ctx.state.contract as Record<string, unknown> | undefined;
    const promotedAssets = promoted?.assets;
    const hasOverrideAssets =
      override.assets &&
      typeof override.assets === 'object' &&
      Object.keys(override.assets as object).length > 0;
    if (!hasOverrideAssets && promotedAssets) {
      override = { ...override, assets: promotedAssets };
    }
  }
  const { system, user } = buildSkillLlmMessages({
    pack: args.pack,
    ctx,
    contractOverride: override,
  });
  const text = assertCleanWritingManuscript(
    await args.llm({ system, user, ctx }),
    'Core Skill 成稿'
  );
  const artifact = {
    kind: 'text' as const,
    text,
    metadata: { mxmWarp: true, coreSkill: true },
  };
  return {
    ...ctx,
    state: {
      ...ctx.state,
      coreArtifact: artifact,
      // enrich.nestedText 可能留下策划 JSON；成稿必须同步覆盖，否则落盘优先 finalArtifact 会存 JSON
      finalArtifact: artifact,
      finalPrompt: system,
      warpOutputRaw: text,
    },
  };
}

/**
 * text 业务：用 skill 正文作模板语义，params 全量 + 可选 contract 切片进 user。
 * 兼容现有 ${var}：若 body 含 ${，走简单替换；否则 body 作 system，params JSON 作 user。
 */
export function renderTextSkillPrompt(args: {
  pack: SkillPack;
  params: Record<string, unknown>;
}): { system: string; user: string; finalPrompt: string } {
  const f = getSkillFile(args.pack, SKILL_MD_PATH);
  if (!f?.content?.trim()) {
    throw new Error('text Core Skill：缺少 SKILL.md');
  }
  const parsed = parseSkillMd(f.content);
  let body = parsed.body;
  const hasInterp = body.includes('${');
  if (hasInterp) {
    body = body.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => {
      const v = args.params[key];
      if (v == null) return '';
      if (typeof v === 'string') return v;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    });
  }

  const refPaths = parsed.frontmatter.loadReferences ?? [];
  const refs: string[] = [];
  for (const rp of refPaths) {
    const rf = getSkillFile(args.pack, rp);
    if (rf?.content?.trim()) refs.push(rf.content.trim());
  }

  const system = [body, refs.length ? `\n# references\n\n${refs.join('\n\n')}` : '']
    .filter(Boolean)
    .join('\n');

  // 管道注入的证据包：插值模板未引用时仍追加，避免专家只看见瘦合同
  let evidenceAppendix = '';
  if (args.params.evidencePack != null && args.params.evidencePack !== '') {
    try {
      const raw =
        typeof args.params.evidencePack === 'string'
          ? args.params.evidencePack
          : JSON.stringify(args.params.evidencePack, null, 2);
      if (raw.trim() && raw.trim() !== '[]' && raw.trim() !== '{}') {
        evidenceAppendix = `\n\n# Evidence pack\n\nUse these search digests when filling fields. Do not invent facts beyond them.\n\n${raw}`;
      }
    } catch {
      /* ignore */
    }
  }

  const systemWithEvidence = evidenceAppendix ? `${system}${evidenceAppendix}` : system;

  const user = hasInterp
    ? '(see system; variables already interpolated)'
    : JSON.stringify({ params: args.params }, null, 2);

  return { system: systemWithEvidence, user, finalPrompt: systemWithEvidence };
}
