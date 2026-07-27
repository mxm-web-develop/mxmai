/**
 * 从任务 JSON 压缩管线 I/O，供归因 LLM 使用
 */

import { MAX_PIPELINE_BUNDLE_CHARS } from './types';

const STEP_FIELD_MAX = 1200;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…(truncated ${s.length - max} chars)`;
}

function safeJson(value: unknown, max = STEP_FIELD_MAX): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 0);
    return truncate(s || '', max);
  } catch {
    return '[unserializable]';
  }
}

function pickState(task: Record<string, unknown>): Record<string, unknown> {
  const rp = (task.requestParams || {}) as Record<string, unknown>;
  const md = (task.metadata || {}) as Record<string, unknown>;
  const result = (task.result || {}) as Record<string, unknown>;
  const resultMd = (result.metadata || {}) as Record<string, unknown>;
  return {
    ...(typeof rp.businessPipelineState === 'object' && rp.businessPipelineState
      ? (rp.businessPipelineState as Record<string, unknown>)
      : {}),
    ...(typeof md.businessPipelineState === 'object' && md.businessPipelineState
      ? (md.businessPipelineState as Record<string, unknown>)
      : {}),
    pipelineTrace:
      resultMd.pipelineTrace ??
      (rp.businessPipelineState as Record<string, unknown> | undefined)?.pipelineTrace ??
      md.pipelineTrace,
  };
}

/**
 * 构建可读的管线摘要（非完整 dump）
 */
export function buildPipelineBundle(task: Record<string, unknown>): string {
  const state = pickState(task);
  const result = (task.result || {}) as Record<string, unknown>;
  const resultMd = (result.metadata || {}) as Record<string, unknown>;
  const rp = (task.requestParams || {}) as Record<string, unknown>;

  const sections: string[] = [];

  sections.push('## Task meta');
  sections.push(
    safeJson({
      id: task.id,
      type: task.type,
      status: task.status,
      taskV2: rp.taskV2 || (task.metadata as Record<string, unknown>)?.taskV2,
    }, 800)
  );

  const trace = state.pipelineTrace;
  if (Array.isArray(trace) && trace.length) {
    sections.push('## pipelineTrace');
    sections.push(safeJson(trace, 4000));
  }

  if (state.contract && typeof state.contract === 'object') {
    const c = state.contract as Record<string, unknown>;
    sections.push('## contract.basic');
    sections.push(safeJson(c.basic, 2000));
    sections.push('## contract.business (keys)');
    const biz = c.business;
    if (biz && typeof biz === 'object') {
      const keys = Object.keys(biz as object);
      sections.push(`keys: ${keys.join(', ')}`);
      for (const k of keys.slice(0, 12)) {
        sections.push(`### business.${k}`);
        sections.push(safeJson((biz as Record<string, unknown>)[k], STEP_FIELD_MAX));
      }
    } else {
      sections.push(safeJson(biz, 2000));
    }
    if (c.sources) {
      sections.push('## contract.sources');
      sections.push(safeJson(c.sources, 3000));
    }
    if (c.enrich_search) {
      sections.push('## contract.enrich_search');
      sections.push(safeJson(c.enrich_search, 3000));
    }
  }

  if (state.nestedTextLast) {
    sections.push('## nestedTextLast');
    sections.push(safeJson(state.nestedTextLast, 2500));
  }

  if (state.pipelineNestedUsage) {
    sections.push('## pipelineNestedUsage');
    sections.push(safeJson(state.pipelineNestedUsage, 1500));
  }

  if (state.coreArtifact) {
    sections.push('## coreArtifact');
    sections.push(safeJson(state.coreArtifact, 2500));
  }
  if (state.finalArtifact) {
    sections.push('## finalArtifact');
    sections.push(safeJson(state.finalArtifact, 2500));
  }

  if (resultMd.pipelineNestedUsage) {
    sections.push('## result.metadata.pipelineNestedUsage');
    sections.push(safeJson(resultMd.pipelineNestedUsage, 1500));
  }

  // 创建参数摘要（不含巨型 base64）
  const paramsSummary: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rp)) {
    if (k === 'businessPipelineState' || k === 'taskV2') continue;
    if (typeof v === 'string' && v.length > 500) {
      paramsSummary[k] = truncate(v, 400);
    } else if (typeof v === 'object' && v !== null) {
      paramsSummary[k] = safeJson(v, 400);
    } else {
      paramsSummary[k] = v;
    }
  }
  sections.push('## requestParams (sans pipeline state)');
  sections.push(safeJson(paramsSummary, 4000));

  return truncate(sections.join('\n\n'), MAX_PIPELINE_BUNDLE_CHARS);
}

/**
 * 从任务对象提取成稿正文
 */
export function extractArticleTextFromTask(task: Record<string, unknown>): string {
  const result = (task.result || {}) as Record<string, unknown>;
  const md = (result.metadata || {}) as Record<string, unknown>;
  const rp = (task.requestParams || {}) as Record<string, unknown>;
  const state = (rp.businessPipelineState || {}) as Record<string, unknown>;

  const candidates: unknown[] = [
    md.text,
    (md.finalArtifact as Record<string, unknown> | undefined)?.text,
    (md.coreArtifact as Record<string, unknown> | undefined)?.text,
    (state.finalArtifact as Record<string, unknown> | undefined)?.text,
    (state.coreArtifact as Record<string, unknown> | undefined)?.text,
    (state.nestedTextLast as Record<string, unknown> | undefined)?.text,
    md.outline,
    result.text,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (c && typeof c === 'object') {
      try {
        const s = JSON.stringify(c, null, 2);
        if (s && s !== '{}' && s !== 'null') return s;
      } catch {
        /* ignore */
      }
    }
  }

  const urls = result.mediaUrls;
  if (Array.isArray(urls) && urls[0] && typeof urls[0] === 'string' && !urls[0].startsWith('http')) {
    return String(urls[0]).trim();
  }

  return '';
}
