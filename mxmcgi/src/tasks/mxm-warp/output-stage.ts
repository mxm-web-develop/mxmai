/**
 * mxm-warp output：业务 Prompt + 合同视图 + 可追溯 citationBrief
 * 成稿保持阅读体验：不强制文末「参考来源」链接列表。
 */
import type { TaskContext } from '../types';
import { getContract, type WarpLlmFn } from './input-stage';
import { buildCitationBrief, buildContractView } from './evidence';
import { stripClosingInvestmentBlurb, stripEditorialChromeLabels } from './citation-appendix';

export async function runOutputStage(args: {
  ctx: TaskContext;
  /** 业务 output Prompt（角色 / 业务 / 交付规范） */
  outputPrompt: string;
  llm: WarpLlmFn;
}): Promise<TaskContext> {
  const contract = getContract(args.ctx);
  if (!contract) {
    throw new Error('mxm-warp output：缺少 state.contract');
  }

  const contractView = buildContractView(contract as Record<string, unknown>);
  const citationBrief = buildCitationBrief(args.ctx, { maxItems: 24 });
  const basic =
    contract.basic && typeof contract.basic === 'object'
      ? (contract.basic as Record<string, unknown>)
      : {};
  const subjectiveOn = basic.subjective_analysis === true;

  const system = [
    args.outputPrompt.trim() || 'You produce the final deliverable for this business.',
    '',
    'The filled business contract JSON is the structural plan (titles, sections, beats).',
    'citationBrief is the ONLY allowed source list for reader-facing attributions (url / domain / title).',
    'Prefer citationBrief entries whose url looks like a specific article (not a channel/home/list page).',
    'Inline citations MUST match citationBrief entries — never invent outlet names or dates.',
    'If citationBrief only has channel/list pages, write a SHORT brief and avoid precise scores/lineups/quotes.',
    'If a fact has no matching citationBrief entry, OMIT it. Do NOT write reader hedges like 待核实 / 通稿补充 / 以官方为准.',
    '',
    'SOURCE GROUNDING (hard, reading experience first):',
    '- Do NOT add a trailing "## 参考来源" / "## References" link list or bibliography chapter.',
    '- Inline attributions are OPTIONAL and sparing: use 据“某某”报道 / 引用“某某”的报道 only when the prose needs grounding (first key figure, contested claim, report finding) — NOT on every sentence or every news beat.',
    '- Names must come from citationBrief; never invent outlets; same source at most once per section.',
    '',
    'ANTI AI-FLUFF (hard):',
    '- Ban empty transitions: 综上所述 / 值得注意的是 / 在此背景下 / 不难发现 / 总而言之.',
    '- Prefer concrete nouns/numbers/quotes from citationBrief.summary.',
    subjectiveOn
      ? '- Subjective analysis is ON: analysis after facts is allowed per analysis_stance.'
      : [
          '- Subjective analysis is OFF (hard):',
          '  * No 小结/展望/板块催化/投资看点 chapters or tables.',
          '  * No 估值修复/确定性/催化/配置建议 sentences.',
          '  * No footer like 本报告基于公开信息整理.',
          '  * End after the last factual section.',
        ].join('\n'),
    '',
    'DATA AUTHENTICITY (hard):',
    '- Only write precise numbers that appear in citationBrief.summary/title or contract evidence; if unsure, omit the number or soften (约/超过) without inventing digits.',
    '- When first introducing a major market figure or report finding, prefer one natural inline cite (据“报告/机构名”…) if it fits the prose — not on every bullet.',
    '- Never invent exhibition edition (第N届), venue area, headcount, or revenue without an exact match in evidence.',
    '- Do not write comparative claims like 创新高 / 再创新高 unless the evidence states the comparison baseline.',
    '',
    'Deliver the manuscript required by the business prompt and the contract.',
    'If business.body_sections is empty, follow the skeleton in the business prompt (period overview first, then independent focal chapters from selection/topics).',
    'Do NOT surface search items outside the selected topics as extra chapters or lead inventories.',
  ].join('\n');

  const user = JSON.stringify({ contract: contractView, citationBrief }, null, 2);
  let text = await args.llm({ system, user, ctx: args.ctx });
  text = stripEditorialChromeLabels(text);

  if (!subjectiveOn) {
    text = stripClosingInvestmentBlurb(text);
  }

  const artifact = {
    kind: 'text' as const,
    text,
    metadata: {
      mxmWarp: true,
      citationBriefCount: citationBrief.length,
    },
  };
  return {
    ...args.ctx,
    state: {
      ...args.ctx.state,
      coreArtifact: artifact,
      // 与 coreSkill 路径一致：覆盖 enrich 留下的 stale finalArtifact（常为 expert JSON）
      finalArtifact: artifact,
    },
    finalPrompt: system,
    warpOutputRaw: text,
  };
}
