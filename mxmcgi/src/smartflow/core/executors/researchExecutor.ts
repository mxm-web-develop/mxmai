/**
 * Research 复合节点：生成查询 → deep_search → 摘要
 */

import { SmartflowNode, ExecutionContext, ToolType } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { ToolsExecutor } from './toolsExecutor';
import type { CompositeTaskRef } from '../models/composite-types';
import {
  buildCompositeOutput,
  CompositeRunState,
  resolveNodeString,
  runCompositeTaskRef,
  runModelCompletion,
  usageFromMetadata,
} from '../composite/runner';
import { resolveWritingModel } from '../composite/default-writing-model';

/** 默认用直连模型生成检索词，避免依赖 DB 中 text/think 配置；model 在 execute 时解析 */
const DEFAULT_QUERY_GEN: CompositeTaskRef = {
  kind: 'model',
};

export class ResearchExecutor extends BaseExecutor {
  private toolsExecutor = new ToolsExecutor();

  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const userId = context.execution?.user_id;
      if (!userId) {
        return this.createErrorResult('Research node requires user_id in context');
      }

      const topic = resolveNodeString(node.topic ?? node.goal, context, 'Research topic');
      const ctxText = resolveNodeString(node.context, context, '');
      const depth = node.search_depth ?? 'standard';
      const summarizerModel = resolveWritingModel(node.summarizer_model);
      const queryGenRef: CompositeTaskRef =
        node.query_generator != null
          ? { ...node.query_generator, model: resolveWritingModel(node.query_generator.model) }
          : { ...DEFAULT_QUERY_GEN, model: resolveWritingModel() };

      const state = new CompositeRunState();

      const queryPrompt = `Topic: ${topic}\n${ctxText ? `Context: ${ctxText}\n` : ''}Generate 3-5 search queries as a JSON string array only.`;
      const t0 = Date.now();
      const qRes = await runCompositeTaskRef(queryGenRef, queryPrompt, context, userId);
      let queries: string[] = [];
      try {
        const parsed = JSON.parse(qRes.text.trim());
        if (Array.isArray(parsed)) {
          queries = parsed.map(String).filter(Boolean).slice(0, 5);
        }
      } catch {
        queries = qRes.text
          .split('\n')
          .map((l) => l.replace(/^[\d.\-\*]+\s*/, '').trim())
          .filter((l) => l.length > 3)
          .slice(0, 5);
      }
      if (queries.length === 0) queries = [topic];
      state.appendTrace({
        phase: 'query_gen',
        duration_ms: Date.now() - t0,
        summary: queries.join('; '),
      });
      state.addUsage(usageFromMetadata(qRes.metadata));

      const allResults: Array<{ title?: string; url?: string; snippet?: string }> = [];
      for (const query of queries) {
        const toolNode = {
          id: 'research_deep_search',
          type: 'tools' as const,
          tool_type: 'deep_search' as ToolType,
          tool_params: { query, depth, numResults: 8 },
        };
        const t1 = Date.now();
        const searchRes = await this.toolsExecutor.execute(toolNode, context);
        if (!searchRes.success) continue;
        state.appendTrace({
          phase: 'deep_search',
          tool_name: 'deep_search',
          duration_ms: Date.now() - t1,
          summary: query.slice(0, 80),
        });
        state.addUsage({ tool_calls: 1 });
        const results = (searchRes.output as { results?: unknown[] })?.results ?? [];
        for (const r of results) {
          const item = r as Record<string, unknown>;
          allResults.push({
            title: String(item.title ?? ''),
            url: String(item.url ?? item.link ?? ''),
            snippet: String(item.snippet ?? item.content ?? '').slice(0, 400),
          });
        }
      }

      const hitsText = allResults
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url}`)
        .join('\n\n');
      const sumPrompt = `Topic: ${topic}\n\nSearch results:\n${hitsText || '(no results)'}\n\nWrite a concise research summary in Markdown.`;
      const t2 = Date.now();
      const sumRes = await runModelCompletion(summarizerModel, sumPrompt, userId);
      state.appendTrace({
        phase: 'summarize',
        duration_ms: Date.now() - t2,
        summary: sumRes.text.slice(0, 200),
      });
      state.addUsage(usageFromMetadata(sumRes.metadata));

      const output = buildCompositeOutput(
        'research',
        sumRes.text,
        {
          queries,
          sources: allResults.slice(0, 20),
          raw_hits_count: allResults.length,
        },
        state.trace,
        state.usage,
        'finished',
        true
      );
      return this.createSuccessResult(output);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Research executor error: ${msg}`);
    }
  }
}
