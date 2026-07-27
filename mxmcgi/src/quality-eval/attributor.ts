/**
 * 管线逐步 I/O 归因（仅系统任务且存在低分维度时）
 */

import { runByModelKey } from '../models/run';
import type { GenerateResult, ProviderType } from '../models/providers';
import { UsageService } from '../statistics/usage-service';
import type { ArticleScoreResult, AttributionResult, AttributionStepFinding, QualityEvalRubric } from './types';

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
  if (start < 0 || end <= start) throw new Error('归因模型未返回 JSON 对象');
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

export async function attributePipeline(args: {
  rubric: QualityEvalRubric;
  scores: ArticleScoreResult;
  pipelineBundle: string;
  provider?: string;
  modelKey?: string;
  runId?: string;
}): Promise<AttributionResult> {
  const failed = args.scores.dimensions.filter((d) => d.failed);
  if (failed.length === 0) {
    return { findings: [], summary: '各维度均达到及格线，无需管线归因。' };
  }

  const provider = (args.provider || args.rubric.provider) as ProviderType;
  const modelKey = args.modelKey || args.rubric.model_key;

  const system = `你是管线调试专家。根据「低分维度」与「管线步骤输入/输出摘要」，推断最可能导致成稿质量问题的步骤。
规则：
- 只基于提供的摘要推断，不要编造不存在的步骤名。
- severity: high|medium|low
- 给出可操作的改进建议（改 prompt、改 enrich、改校验、改人工审核点等）。
- 只输出 JSON。`;

  const user = `## 低分维度
${failed
  .map((d) => `- ${d.key} (${d.label}): ${d.score} 分；评语: ${d.comment}；证据: ${(d.evidence || []).join(' | ')}`)
  .join('\n')}

## 总分与类型匹配
overall=${args.scores.overall}
articleTypeFit=${args.scores.articleTypeFit}
summary=${args.scores.summary}

## 业务
${args.rubric.task_key}/${args.rubric.subtype}
${args.rubric.business_brief || ''}

## 管线 I/O 摘要
${args.pipelineBundle}

## 输出 JSON
{
  "summary": "归因总述",
  "findings": [
    {
      "step": "步骤名",
      "phase": "pre|enrich|post|core|unknown",
      "severity": "high|medium|low",
      "relatedDimensions": ["维度key"],
      "reason": "原因",
      "suggestion": "改进建议"
    }
  ]
}`;

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
      taskId: args.runId ? `quality-eval-attr-${args.runId}` : undefined,
      result,
      providerOverride: provider,
      logicalModel: 'quality-eval-attribute',
      taskType: 'text',
    });
  } catch (e) {
    console.warn('[quality-eval] logProviderUsage(attr) failed:', e instanceof Error ? e.message : e);
  }

  const raw = extractText(result);
  if (!raw) throw new Error('归因模型返回空内容');
  const parsed = parseJsonObject(raw);
  const findingsRaw = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: AttributionStepFinding[] = findingsRaw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      step: String(x.step || 'unknown'),
      phase: x.phase != null ? String(x.phase) : undefined,
      severity: (['high', 'medium', 'low'].includes(String(x.severity))
        ? String(x.severity)
        : 'medium') as AttributionStepFinding['severity'],
      relatedDimensions: Array.isArray(x.relatedDimensions)
        ? (x.relatedDimensions as unknown[]).map((d) => String(d))
        : [],
      reason: String(x.reason || ''),
      suggestion: String(x.suggestion || ''),
    }));

  return {
    summary: String(parsed.summary || ''),
    findings,
  };
}
