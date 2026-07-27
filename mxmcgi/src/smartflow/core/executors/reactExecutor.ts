/**
 * ReAct 复合节点：LLM 推理 + 工具调用循环
 * 使用文本 Action/Observation 协议（兼容无 native tool_calls 的模型）
 */

import { SmartflowNode, ExecutionContext, ToolType } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { ToolsExecutor } from './toolsExecutor';
import {
  buildCompositeOutput,
  CompositeRunState,
  resolveNodeString,
  runModelCompletion,
  usageFromMetadata,
} from '../composite/runner';

const TOOL_HINT = `When you need a tool, respond with exactly one block:
Action: <tool_name>
Action Input: <JSON object>

Available tools: deep_search, web_search, web_scraper

When you have enough information, respond with:
Final Answer: <your answer>`;

export class ReactExecutor extends BaseExecutor {
  private toolsExecutor = new ToolsExecutor();

  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const userId = context.execution?.user_id;
      if (!userId) {
        return this.createErrorResult('React node requires user_id in context');
      }

      const goal = resolveNodeString(node.goal, context, 'Answer the user question.');
      const model = node.model ?? 'gpt-4o-mini';
      const maxSteps = Math.min(Math.max(node.max_steps ?? 10, 1), 20);
      const allowedTools = (node.tools?.length ? node.tools : ['deep_search', 'web_search']) as ToolType[];
      const systemPrompt = node.system_prompt?.trim()
        ? `${node.system_prompt}\n\n${TOOL_HINT}`
        : `You are a helpful agent.\n${TOOL_HINT}`;

      const state = new CompositeRunState();
      const toolCalls: Array<{ name: string; input_summary: string; observation_preview: string }> = [];
      const sources: Array<{ title?: string; url?: string; snippet?: string }> = [];
      let messages = `System: ${systemPrompt}\n\nUser: ${goal}\n\n`;
      let finalAnswer = '';
      let stoppedBy: 'model' | 'max_steps' | 'budget' = 'max_steps';

      for (let step = 1; step <= maxSteps; step++) {
        const t0 = Date.now();
        const modelParams = (node.model_params ?? node.options ?? {}) as Record<string, unknown>;
        const llmRes = await runModelCompletion(model, messages, userId, {
          temperature: 0.4,
          max_tokens: Number(modelParams.max_tokens ?? 2000),
        });
        state.addUsage(usageFromMetadata(llmRes.metadata));
        const text = llmRes.text.trim();

        const finalMatch = text.match(/Final Answer:\s*([\s\S]+)/i);
        if (finalMatch) {
          finalAnswer = finalMatch[1].trim();
          stoppedBy = 'model';
          state.appendTrace({
            phase: 'final',
            duration_ms: Date.now() - t0,
            summary: finalAnswer.slice(0, 200),
          });
          break;
        }

        const actionMatch = text.match(/Action:\s*(\w+)/i);
        const inputMatch = text.match(/Action Input:\s*([\s\S]*?)(?:\n\n|$)/i);
        if (!actionMatch) {
          finalAnswer = text;
          stoppedBy = 'model';
          state.appendTrace({ phase: 'direct_answer', duration_ms: Date.now() - t0, summary: text.slice(0, 200) });
          break;
        }

        const toolName = actionMatch[1].trim().toLowerCase();
        const mappedType = this.mapToolName(toolName, allowedTools);
        if (!mappedType) {
          messages += `Assistant: ${text}\n\nObservation: Tool "${toolName}" is not allowed. Use one of: ${allowedTools.join(', ')}.\n\n`;
          continue;
        }

        let actionInput: Record<string, unknown> = {};
        if (inputMatch) {
          try {
            actionInput = JSON.parse(inputMatch[1].trim()) as Record<string, unknown>;
          } catch {
            actionInput = { query: inputMatch[1].trim() };
          }
        }
        if (!actionInput.query && !actionInput.url) {
          actionInput.query = goal;
        }

        const toolNode = {
          id: `react_tool_${step}`,
          type: 'tools' as const,
          tool_type: mappedType,
          tool_params: { ...node.tool_params, ...actionInput },
        };
        const t1 = Date.now();
        const toolRes = await this.toolsExecutor.execute(toolNode, context);
        const observation = toolRes.success
          ? JSON.stringify(toolRes.output).slice(0, 4000)
          : `Error: ${toolRes.error}`;
        state.addUsage({ tool_calls: 1 });
        state.appendTrace({
          phase: 'tool',
          tool_name: mappedType,
          duration_ms: Date.now() - t1,
          summary: observation.slice(0, 150),
        });

        this.collectSources(toolRes.output, sources);
        toolCalls.push({
          name: mappedType,
          input_summary: JSON.stringify(actionInput).slice(0, 200),
          observation_preview: observation.slice(0, 200),
        });

        messages += `Assistant: ${text}\n\nObservation: ${observation}\n\n`;
      }

      if (!finalAnswer) {
        finalAnswer = messages.slice(-2000);
        stoppedBy = 'max_steps';
      }

      const output = buildCompositeOutput(
        'react',
        finalAnswer,
        {
          final_answer: finalAnswer,
          steps_used: state.trace.length,
          tool_calls: toolCalls,
          sources: sources.slice(0, 30),
          stopped_by: stoppedBy,
        },
        state.trace,
        state.usage,
        stoppedBy === 'model' ? 'finished' : 'max_steps',
        true
      );
      return this.createSuccessResult(output);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`React executor error: ${msg}`);
    }
  }

  private mapToolName(name: string, allowed: ToolType[]): ToolType | null {
    const aliases: Record<string, ToolType> = {
      deep_search: 'deep_search',
      deepsearch: 'deep_search',
      search: 'web_search',
      web_search: 'web_search',
      brave: 'web_search',
      web_scraper: 'web_scraper',
      scraper: 'web_scraper',
    };
    const mapped = aliases[name.replace(/-/g, '_')];
    if (mapped && allowed.includes(mapped)) return mapped;
    return allowed.find((t) => t === name || t.replace('_', '') === name.replace('_', '')) ?? null;
  }

  private collectSources(output: unknown, sources: Array<{ title?: string; url?: string; snippet?: string }>): void {
    if (!output || typeof output !== 'object') return;
    const o = output as Record<string, unknown>;
    const list = (o.results as unknown[]) ?? (o.aggregated as unknown[]) ?? [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      sources.push({
        title: String(r.title ?? ''),
        url: String(r.url ?? r.link ?? ''),
        snippet: String(r.snippet ?? r.content ?? '').slice(0, 300),
      });
    }
  }
}
