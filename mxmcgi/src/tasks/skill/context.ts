/**
 * Skill 执行上下文：合同切片 + references + 声明式 inputs
 */
import type { TaskContext } from '../types';
import { getContract } from '../mxm-warp/input-stage';
import { buildContractView, buildEvidencePack } from '../mxm-warp/evidence';
import { getSkillFile } from './pack';
import { parseSkillMd } from './parse';
import { CONTRACT_REF_PATH, SKILL_MD_PATH, type SkillPack } from './types';

function getByPath(root: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Output / Core Skill 合同切片：结构真源（basic/business/assets）+ 检索指针，
 * 不含大段 websource / enrich result 原文（原文在 state.evidence）。
 */
export function sliceContractForSkill(contract: Record<string, unknown>): Record<string, unknown> {
  return buildContractView(contract);
}

function resolveInputPath(path: string, ctx: TaskContext, contract: Record<string, unknown>): unknown {
  const p = path.trim();
  if (p.startsWith('contract.')) return getByPath(contract, p.slice('contract.'.length));
  if (p.startsWith('params.')) return getByPath(ctx.params, p.slice('params.'.length));
  if (p.startsWith('state.')) return getByPath(ctx.state, p.slice('state.'.length));
  if (p === 'contract') return contract;
  if (p === 'params') return ctx.params;
  return getByPath(contract, p);
}

export function buildSkillLlmMessages(args: {
  pack: SkillPack;
  ctx: TaskContext;
  /** 覆盖合同（group 单路） */
  contractOverride?: Record<string, unknown> | null;
  /**
   * output 默认不附检索语料；nested/expert 可传更大预算。
   * 设为 0 则不附 evidencePack。
   */
  evidenceMaxChars?: number;
}): { system: string; user: string; skillBody: string } {
  const skillFile = getSkillFile(args.pack, SKILL_MD_PATH);
  if (!skillFile?.content?.trim()) {
    throw new Error('Core Skill：缺少 SKILL.md');
  }
  const parsed = parseSkillMd(skillFile.content);
  const fullContract =
    args.contractOverride ??
    (getContract(args.ctx) as unknown as Record<string, unknown> | null) ??
    {};
  if (!fullContract || typeof fullContract !== 'object') {
    throw new Error('Core Skill：缺少 state.contract');
  }

  const sliced = sliceContractForSkill(fullContract);
  const fm = parsed.frontmatter;
  const refPaths = fm.loadReferences?.length
    ? fm.loadReferences
    : [CONTRACT_REF_PATH];

  const refChunks: string[] = [];
  for (const rp of refPaths) {
    const f = getSkillFile(args.pack, rp);
    if (f?.content?.trim()) {
      refChunks.push(`## reference:${rp}\n\n${f.content.trim()}`);
    }
  }

  let bound: Record<string, unknown> | null = null;
  if (fm.inputs && Object.keys(fm.inputs).length > 0) {
    bound = {};
    for (const [k, path] of Object.entries(fm.inputs)) {
      bound[k] = resolveInputPath(path, args.ctx, fullContract);
    }
  }

  const system = [
    parsed.body.trim() || 'You produce the final deliverable for this business.',
    '',
    'Use the contract / bound inputs as the factual basis.',
    'Do not invent facts absent from the provided materials.',
    'Prefer business fields already filled by earlier pipeline steps over raw search dumps.',
    refChunks.length ? `\n# Skill references\n\n${refChunks.join('\n\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // output 默认不附检索语料：成稿应消费 enrich 已写入的 business，禁止再灌全仓证据
  const evidenceBudget = args.evidenceMaxChars ?? 0;
  const evidencePack =
    evidenceBudget > 0 ? buildEvidencePack(args.ctx, { maxChars: evidenceBudget }) : [];

  const userPayload: Record<string, unknown> = bound
    ? { inputs: bound, contract: sliced }
    : { contract: sliced };
  if (evidencePack.length > 0) {
    userPayload.evidencePack = evidencePack;
  }

  return {
    system,
    user: JSON.stringify(userPayload, null, 2),
    skillBody: parsed.body,
  };
}
