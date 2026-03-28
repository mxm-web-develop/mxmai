/**
 * pipeline-llm-plugin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline LLM Step 插件机制。
 *
 * 设计目标：
 *  - Pipeline 中的 LLM 步骤（text-plan / text-thinking / text-format）作为插件
 *    注册到 inputSteps / outputSteps，而非硬编码。
 *  - 每个 LLM step 通过 params 配置：
 *      model / provider        → 调用哪个模型
 *      systemPrompt / userPrompt → 提示词模版（支持 ${prevStep.outputField} 插值）
 *      outputVar               → 结果写入 ctx.state[outputVar]
 *      schema                  → 输出 JSON Schema（可选，验证 LLM 产出）
 *      temperature / maxTokens → 生成参数
 *  - prompt 模版中的 ${prev.xxx} 引用在前序 step 产出中查找。
 *  - Schema 验证失败可重试（maxRetries），仍失败则抛 PipelineStepError。
 *
 * 使用方式（在 pipeline.ts 初始化时注册）：
 *   registerLLMStep('textPlan', { defaultModel: 'deerapi/deepseek-r1', scope: 'writing' });
 *   registerLLMStep('textThinking', { ... });
 *   registerLLMStep('textFormat', { ... });
 *
 * DB 中的 pipeline 配置示例：
 *   {
 *     "step": "textPlan",
 *     "params": {
 *       "model": "writing-plan",          // 逻辑模型（通过 routing 解析为物理模型）
 *       "provider": "deerapi",
 *       "systemPrompt": "你是一个专业的写作规划助手。",
 *       "userPrompt": "用户需求：${params.prompt}\n请制定写作计划：",
 *       "outputVar": "plan",
 *       "schema": {
 *         "type": "object",
 *         "properties": {
 *           "sections": { "type": "array", "items": { "type": "string" } },
 *           "tone": { "type": "string" },
 *           "targetLength": { "type": "string" }
 *         },
 *         "required": ["sections"]
 *       },
 *       "temperature": 0.5,
 *       "maxTokens": 1500
 *     }
 *   }
 *
 * 前序引用语法：
 *   - `${params.field}`        → ctx.params 上的字段
 *   - `${state.stepName}`      → ctx.state.stepName（整个对象）
 *   - `${state.stepName.field}`→ ctx.state.stepName 的子字段
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PipelineStep, TaskContext, JsonSchemaV2 } from './types';
import { runByModelKey } from '../models/run';
import { getResolvedRouting } from '../models/providers';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { registerInputStep } from './pipeline-registry';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** LLM Step 的标准参数结构 */
export interface LLMStepParams {
  /** 逻辑模型名（通过 routing 解析为物理模型），默认使用 scope 对应的默认模型 */
  model?: string;
  /** provider override */
  provider?: string;
  /** 系统提示词模版 */
  systemPrompt?: string;
  /** 用户提示词模版（支持 ${prev.xxx} 引用前序产出） */
  userPrompt: string;
  /** 结果写入 ctx.state 的哪个字段 */
  outputVar: string;
  /** 期望的输出 JSON Schema（可选）。指定后 LLM 产出会被验证 */
  schema?: JsonSchemaV2;
  /** 生成参数 */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Schema 验证失败时最大重试次数（默认 1，不重试） */
  maxRetries?: number;
  /** 解析策略：plain（纯文本）/ json（强制 JSON parse）/ auto（先试 JSON，失败则退化为纯文本） */
  parseMode?: 'plain' | 'json' | 'auto';
  /** 是否在 ctx.state 中保留原始 LLM 响应（rawResponse.{outputVar}） */
  keepRawResponse?: boolean;
}

export interface LLMStepOptions {
  /** 该 step type 默认使用的 scope */
  scope: 'writing' | 'outline' | 'graph' | 'audio' | 'video';
  /** 默认逻辑模型 */
  defaultModel?: string;
  /** 默认 provider */
  defaultProvider?: string;
  /** 默认温度 */
  defaultTemperature?: number;
  /** 默认最大 token 数 */
  defaultMaxTokens?: number;
  /** 默认解析策略 */
  defaultParseMode?: 'plain' | 'json' | 'auto';
  /** 默认最大重试次数 */
  defaultMaxRetries?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从 ctx.state 解析引用字符串，返回实际值。
 * 支持：
 *   ${params.field}          → ctx.params[field]
 *   ${state.stepName}        → ctx.state[stepName]  (整个对象)
 *   ${state.stepName.field} → ctx.state[stepName][field]
 *   ${state.stepName.field.nested} → 多层属性
 */
function resolveRef(ref: string, ctx: TaskContext): string {
  const match = ref.match(/^\$\{([^}]+)\}$/);
  if (!match) return ref;

  const path = match[1];
  if (path.startsWith('params.')) {
    const field = path.slice('params.'.length);
    return String(ctx.params[field] ?? '');
  }
  if (path.startsWith('state.')) {
    const rest = path.slice('state.'.length);
    const dotIdx = rest.indexOf('.');
    if (dotIdx === -1) {
      const val = ctx.state[rest];
      return typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
    }
    const stepName = rest.slice(0, dotIdx);
    const fieldPath = rest.slice(dotIdx + 1);
    const stepState = ctx.state[stepName];
    if (stepState == null || typeof stepState !== 'object') return '';
    const val = (stepState as Record<string, unknown>)[fieldPath];
    return typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
  }
  // 不带前缀的引用：先在 params 再在 state 中查找
  if (ctx.params[path] !== undefined) return String(ctx.params[path]);
  if (ctx.state[path] !== undefined) {
    const v = ctx.state[path];
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return '';
}

/**
 * 递归解析字符串模板中的所有 ${...} 引用。
 */
function interpolateTemplate(template: string, ctx: TaskContext): string {
  return template.replace(/\$\{[^}]+\}/g, (token) => resolveRef(token.trim(), ctx));
}

/**
 * 尝试将字符串解析为 JSON 对象。
 * 策略：
 *   1. 直接 JSON.parse
 *   2. 去掉 markdown ```json ... ``` 包装后再试
 *   3. 去掉 ``` ... ``` 包装后再试
 */
function tryParseJSON(raw: string): { ok: true; value: unknown } | { ok: false; raw: string } {
  const trimmed = raw.trim();
  // 尝试直接解析
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {}

  // 去掉 markdown json block
  const jsonBlockMatch = trimmed.match(/^```json\s*([\s\S]+?)\s*```$/);
  if (jsonBlockMatch) {
    try {
      return { ok: true, value: JSON.parse(jsonBlockMatch[1].trim()) };
    } catch {}
  }
  // 去掉任意 ``` block
  const blockMatch = trimmed.match(/^```\s*([\s\S]+?)\s*```$/);
  if (blockMatch) {
    try {
      return { ok: true, value: JSON.parse(blockMatch[1].trim()) };
    } catch {}
  }
  return { ok: false, raw: raw };
}

/**
 * 根据 parseMode 解析 LLM 原始输出字符串。
 */
function parseOutput(raw: string, parseMode: 'plain' | 'json' | 'auto'): unknown {
  if (parseMode === 'plain') return raw;
  if (parseMode === 'json') {
    const result = tryParseJSON(raw);
    if (!result.ok) throw new Error(`LLM 输出不是有效 JSON：${result.raw.slice(0, 200)}`);
    return result.value;
  }
  // auto 模式：先尝试 JSON，失败则退化为纯文本
  const result = tryParseJSON(raw);
  return result.ok ? result.value : raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Step Runner 工厂
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建一个 LLM Step 的 Runner。
 * 每个通过 registerLLMStep 注册的 step type 都会生成一个标准 Runner，
 * 内部逻辑完全相同，差异只是 options 默认值。
 */
function createLLMStepRunner(stepType: string, options: LLMStepOptions) {
  return async (ctx: TaskContext, step: PipelineStep): Promise<TaskContext> => {
    const p = (step.params ?? {}) as Partial<LLMStepParams>;
    const {
      model: cfgModel,
      provider: cfgProvider,
      systemPrompt,
      userPrompt,
      outputVar,
      schema,
      temperature,
      maxTokens,
      topP,
      maxRetries = 1,
      parseMode = 'auto',
      keepRawResponse = false,
    } = p;

    if (!outputVar) throw new Error(`[${stepType}] LLM step 必须指定 outputVar`);
    if (!userPrompt) throw new Error(`[${stepType}] LLM step 必须指定 userPrompt`);

    // ── 1. Prompt 渲染 ──────────────────────────────────────────────────────
    // 先用当前 ctx 渲染一遍（此时前序 step 的产出已经在 ctx.state 中）
    const resolvedSystem = systemPrompt ? interpolateTemplate(systemPrompt, ctx) : '';
    const resolvedUser = interpolateTemplate(userPrompt, ctx);

    // ── 2. 模型解析 ──────────────────────────────────────────────────────────
    // 如果 params.model 存在，尝试作为逻辑模型走 routing
    // 否则使用 defaultModel
    const routingKey = cfgModel ?? options.defaultModel ?? `${options.scope}-default`;
    const resolved = getResolvedRouting(routingKey, cfgProvider ?? options.defaultProvider ?? undefined);
    const actualProvider = cfgProvider ?? resolved.provider ?? options.defaultProvider ?? 'deerapi';
    const actualModel = resolved.model ?? routingKey;

    // ── 3. LLM 调用（可重试）─────────────────────────────────────────────────
    let lastError: Error | undefined;
    const attemptCount = Math.max(1, maxRetries ?? 1);

    for (let attempt = 1; attempt <= attemptCount; attempt++) {
      try {
        const result = await runByModelKey(
          options.scope,
          actualModel,
          {
            prompt: resolvedUser,
            systemPrompt: resolvedSystem || undefined,
            temperature: temperature ?? options.defaultTemperature ?? 0.7,
            maxTokens: maxTokens ?? options.defaultMaxTokens ?? 4096,
            topP: topP ?? 1.0,
            outputFormat: 'json',
            ...(schema ? { schema } : {}),
          } as any,
          { providerOverride: actualProvider as any }
        );

        const rawText = typeof result === 'string'
          ? result
          : (result as any)?.text
            ?? (result as any)?.content
            ?? (result as any)?.result
            ?? JSON.stringify(result);

        // ── 4. 输出解析 ────────────────────────────────────────────────────
        const parsed = parseOutput(rawText, parseMode ?? options.defaultParseMode ?? 'auto');

        // ── 5. Schema 验证 ─────────────────────────────────────────────────
        if (schema && parsed && typeof parsed === 'object') {
          const validate = ajv.compile(schema);
          if (!validate(parsed)) {
            const errMsg = `Schema 验证失败：${ajv.errorsText(validate.errors)}`;
            if (attempt < attemptCount) {
              console.warn(`[${stepType}] attempt ${attempt} schema 验证失败，重试中...`);
              continue;
            }
            throw new Error(errMsg);
          }
        }

        // ── 6. 写入 ctx.state ──────────────────────────────────────────────
        const newState = {
          ...ctx.state,
          [outputVar]: parsed,
        };
        if (keepRawResponse) {
          (newState as any)[`rawResponse.${outputVar}`] = rawText;
        }

        return { ...ctx, state: newState };

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[${stepType}] attempt ${attempt} 失败: ${lastError.message}`);
        if (attempt < attemptCount) {
          // 重试前把错误信息注入 state，供后续 step 参考
          ctx = {
            ...ctx,
            state: {
              ...ctx.state,
              [`${outputVar}.error`]: lastError.message,
            },
          };
        }
      }
    }

    // 所有重试均失败
    throw new Error(`[${stepType}] LLM step 执行失败（已重试 ${attemptCount} 次）：${lastError?.message}`);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 注册 API（供外部调用）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 注册一个 LLM 类型的 Pipeline Step。
 * 注册后，DB 配置中写 `step: "<stepType>"` 即可使用。
 *
 * @param stepType  step 类型名，如 'textPlan' / 'textThinking' / 'textFormat'
 * @param options   该 step 的默认配置（model / provider / temperature / parseMode 等）
 * @param where     注册到 inputSteps 还是 outputSteps（默认 inputSteps）
 */
export function registerLLMStep(
  stepType: string,
  options: LLMStepOptions,
  where: 'input' | 'output' = 'input'
): void {
  const runner = createLLMStepRunner(stepType, options);
  if (where === 'input') {
    registerInputStep(stepType, runner);
  } else {
    registerOutputStep(stepType, runner);
  }
  console.log(`[pipeline] ✅ LLM step 注册: ${stepType}`, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// 初始化入口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * setupLLMSteps()
 * 在 pipeline.ts 初始化时调用一次，注册所有 LLM step 类型。
 * 调用位置：pipeline.ts 底部
 *
 *   import { setupLLMSteps } from './pipeline-llm-plugin';
 *   setupLLMSteps();
 */
export function setupLLMSteps(): void {
  registerLLMStep('textPlan', {
    scope: 'writing',
    defaultModel: 'writing-plan',
    defaultProvider: 'deerapi',
    defaultTemperature: 0.5,
    defaultMaxTokens: 1500,
    defaultParseMode: 'json',
    defaultMaxRetries: 1,
  });

  registerLLMStep('textThinking', {
    scope: 'writing',
    defaultModel: 'writing-reasoning',
    defaultProvider: 'deerapi',
    defaultTemperature: 0.3,
    defaultMaxTokens: 3000,
    defaultParseMode: 'plain',
    defaultMaxRetries: 1,
  });

  registerLLMStep('textFormat', {
    scope: 'writing',
    defaultModel: 'writing-default',
    defaultProvider: 'deerapi',
    defaultTemperature: 0.7,
    defaultMaxTokens: 2000,
    defaultParseMode: 'json',
    defaultMaxRetries: 1,
  });
}
