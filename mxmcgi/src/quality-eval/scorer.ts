/**
 * 文章多维度评分（LLM）
 */

import { runByModelKey } from '../models/run';
import type { GenerateResult, ProviderType } from '../models/providers';
import { UsageService } from '../statistics/usage-service';
import type { ArticleScoreResult, DimensionScore, QualityEvalDimension, QualityEvalRubric } from './types';
import type { EvalRunContext } from './eval-run-context';
import {
  countManuscriptChars,
  formatEvalRunContextForPrompt,
  resolveLengthBand,
  scoreLengthFit,
} from './eval-run-context';

function extractText(result: GenerateResult): string {
  const t = (result as { text?: string }).text;
  if (typeof t === 'string' && t.trim()) return t.trim();
  const mt = result.metadata?.text;
  if (typeof mt === 'string' && mt.trim()) return mt.trim();
  return '';
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('评分模型未返回 JSON 对象');
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function buildBusinessContext(args: {
  rubric: QualityEvalRubric;
  displayBrief?: string;
  formFieldTitles?: string[];
  evalRunContext?: EvalRunContext | null;
  manuscriptChars?: number;
}): string {
  const parts: string[] = [];
  parts.push(`业务键: ${args.rubric.task_key} / ${args.rubric.subtype}`);
  if (args.displayBrief?.trim()) parts.push(`业务简介: ${args.displayBrief.trim()}`);
  if (args.rubric.business_brief?.trim()) parts.push(`评估要求补充: ${args.rubric.business_brief.trim()}`);
  if (args.formFieldTitles?.length) {
    parts.push(`表单关注点: ${args.formFieldTitles.slice(0, 24).join('、')}`);
  }
  const optionBlock = formatEvalRunContextForPrompt(args.evalRunContext, args.manuscriptChars);
  if (optionBlock) parts.push(optionBlock);
  return parts.join('\n');
}

function buildScorePrompt(args: {
  businessContext: string;
  dimensions: QualityEvalDimension[];
  article: string;
}): { system: string; user: string } {
  const dimList = args.dimensions
    .map(
      (d, i) =>
        `${i + 1}. key=${d.key} | ${d.label} | 权重=${d.weight} | 不及格线=${d.failBelow}\n   说明: ${d.description || '（无）'}`
    )
    .join('\n');

  const system = `你是资深内容质检编辑。先依据「文章类型 / 业务要求 / 本次用户选项」评估稿件是否达标，再按给定维度打分。
规则：
- 每个维度 0-100 分；分数须有依据，evidence 摘录原文短句（可改写压缩）。
- **禁止一套死板标准**：若上下文给出用户选项（篇幅、主观分析开关、幽默/批判等立场、语感文风），grammar / 自然度 / 可读性 / 文风契合必须按选项调整合格线。例如用户选幽默分析时，诙谐比喻与观点先行不应被判为语法错误或空套话。
- length_fit：对照用户 article_length 目标字数带；证据不足导致略短可谅解，注水灌水或严重超长要扣分。
- voice_fit：对照 subjective_analysis / analysis_stance / 语感包是否匹配。
- 优先判断是否符合该业务类型应有的内容结构与信息质量。
- 只输出 JSON，不要 Markdown 说明。`;

  const user = `## 业务与类型要求
${args.businessContext}

## 评分维度
${dimList}

## 待评正文
${args.article}

## 输出 JSON 结构
{
  "overall": 0-100加权总分,
  "summary": "一两句总评",
  "articleTypeFit": "对该业务类型匹配度的说明",
  "dimensions": [
    {
      "key": "维度key",
      "label": "维度名",
      "score": 0-100,
      "evidence": ["证据1"],
      "comment": "简短评语"
    }
  ]
}`;

  return { system, user };
}

export async function scoreArticle(args: {
  rubric: QualityEvalRubric;
  article: string;
  businessContext: string;
  provider?: string;
  modelKey?: string;
  runId?: string;
  evalRunContext?: EvalRunContext | null;
}): Promise<ArticleScoreResult> {
  const provider = (args.provider || args.rubric.provider) as ProviderType;
  const modelKey = args.modelKey || args.rubric.model_key;
  const { system, user } = buildScorePrompt({
    businessContext: args.businessContext,
    dimensions: args.rubric.dimensions,
    article: args.article,
  });

  const result = await runByModelKey(
    'text',
    modelKey,
    {
      prompt: user,
      outputFormat: 'json',
      parameters: { system_prompt: system },
    } as any,
    { providerOverride: provider }
  );

  try {
    await UsageService.logProviderUsage({
      taskId: args.runId ? `quality-eval-${args.runId}` : undefined,
      result,
      providerOverride: provider,
      logicalModel: 'quality-eval-score',
      taskType: 'text',
    });
  } catch (e) {
    console.warn('[quality-eval] logProviderUsage(score) failed:', e instanceof Error ? e.message : e);
  }

  const raw = extractText(result);
  if (!raw) throw new Error('评分模型返回空内容');
  const parsed = parseJsonObject(raw);

  const dimByKey = new Map(args.rubric.dimensions.map((d) => [d.key, d]));
  const rawDims = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
  const dimensions: DimensionScore[] = args.rubric.dimensions.map((def) => {
    const hit = rawDims.find((x: any) => x && (x.key === def.key || x.label === def.label)) as
      | Record<string, unknown>
      | undefined;
    const score = clampScore(hit?.score);
    return {
      key: def.key,
      label: def.label,
      score,
      failed: score < def.failBelow,
      evidence: Array.isArray(hit?.evidence)
        ? (hit!.evidence as unknown[]).map((e) => String(e)).slice(0, 5)
        : [],
      comment: String(hit?.comment || ''),
    };
  });

  // 篇幅：用确定性量尺校正 LLM 的 length_fit（若 rubric 含该维）
  const band = resolveLengthBand(args.evalRunContext?.articleLength);
  if (band) {
    const actual = countManuscriptChars(args.article);
    const fit = scoreLengthFit(actual, band);
    const idx = dimensions.findIndex((d) => d.key === 'length_fit');
    if (idx >= 0) {
      const def = dimByKey.get('length_fit');
      const llmScore = dimensions[idx]!.score;
      const blended = clampScore(fit.score * 0.65 + llmScore * 0.35);
      dimensions[idx] = {
        ...dimensions[idx]!,
        score: blended,
        failed: blended < (def?.failBelow ?? 55),
        comment: `${fit.comment}${dimensions[idx]!.comment ? `｜模型侧：${dimensions[idx]!.comment}` : ''}`,
        evidence: [
          `实测约 ${actual} 字 / 目标 ${band.minChars}–${band.maxChars}`,
          ...dimensions[idx]!.evidence,
        ].slice(0, 5),
      };
    }
  }

  let weightSum = 0;
  let weighted = 0;
  for (const d of dimensions) {
    const w = dimByKey.get(d.key)?.weight ?? 1;
    weightSum += w;
    weighted += d.score * w;
  }
  const computedOverall = weightSum > 0 ? weighted / weightSum : 0;
  // 有 length 校正时用重算总分，避免 overall 与维度脱节
  const overall = clampScore(band ? computedOverall : (parsed.overall ?? computedOverall));

  return {
    overall,
    summary: String(parsed.summary || ''),
    articleTypeFit: String(parsed.articleTypeFit || ''),
    dimensions,
  };
}
