/**
 * Fallback 机制：当 provider 模型调用失败时自动切换到备用模型重试
 */

import type { ProviderType, GenerateParams, GenerateResult } from './types';
import { providerFactory } from './index';

/** Fallback 规则配置 */
export interface FallbackRule {
  provider: string; // 原 provider，如 'maxplan'
  model: string; // 原模型，如 'MiniMax-M2.7-highspeed'
  fallbackProvider: string; // 备用 provider，如 'openai'
  fallbackModel: string; // 备用模型，如 'gpt-5-nano'
}

/** 默认 Fallback 规则（空：由 Admin / 后续 DB 配置扩展，不在代码写死 model） */
export const FALLBACK_RULES: FallbackRule[] = [];

/** Fallback 触发状态码 */
const TRIGGER_STATUS_CODES = new Set([401, 403, 429, 500, 502, 503, 504]);

/** Fallback 触发关键词（不区分大小写） */
const TRIGGER_KEYWORDS = [
  'quota',
  'exhausted',
  'insufficient',
  'balance',
  '余额',
  '限额',
  '额度',
];

/** 已触发过 fallback 的请求ID集合（避免同一请求重复触发） */
const triggeredFallbacks = new Set<string>();

/**
 * 判断是否应该触发 fallback
 */
function shouldTriggerFallback(error: Error, responseStatus?: number, responseBody?: string): boolean {
  // 1. 检查状态码
  if (responseStatus && TRIGGER_STATUS_CODES.has(responseStatus)) {
    console.log(`[Fallback] 触发条件: HTTP 状态码 ${responseStatus}`);
    return true;
  }

  // 2. 检查响应 body 关键词
  if (responseBody) {
    const lowerBody = responseBody.toLowerCase();
    for (const keyword of TRIGGER_KEYWORDS) {
      if (lowerBody.includes(keyword)) {
        console.log(`[Fallback] 触发条件: 响应包含关键词 "${keyword}"`);
        return true;
      }
    }
  }

  // 3. 检查错误消息（超时等情况）
  const errorMsg = error.message.toLowerCase();
  if (errorMsg.includes('timeout') || errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED')) {
    console.log(`[Fallback] 触发条件: 网络错误 - ${error.message}`);
    return true;
  }

  return false;
}

/**
 * 根据原 provider 和 model 查找对应的 fallback 规则
 */
export function findFallbackRule(provider: string, model: string): FallbackRule | undefined {
  return FALLBACK_RULES.find(
    (rule) => rule.provider === provider && rule.model === model
  );
}

/**
 * 解析错误信息中的 HTTP 状态码
 */
function extractStatusCode(errorMessage: string): number | undefined {
  // 匹配 "401"、"403" 等 3 位数字状态码
  const match = errorMessage.match(/\b(\d{3})\b/);
  if (match) {
    const code = parseInt(match[1], 10);
    if (TRIGGER_STATUS_CODES.has(code)) {
      return code;
    }
  }
  return undefined;
}

/**
 * 执行带 fallback 的生成
 * @param scope 模型作用域
 * @param modelKey 模型 key
 * @param params 生成参数
 * @param context 上下文
 * @param requestId 请求唯一标识（用于避免重复触发）
 * @returns 生成结果
 */
export async function runWithFallback(
  scope: string,
  modelKey: string,
  params: GenerateParams,
  context?: any,
  requestId?: string
): Promise<GenerateResult> {
  const rid = requestId ?? `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // 避免同一请求重复触发 fallback
  if (triggeredFallbacks.has(rid)) {
    console.log(`[Fallback] 请求 ${rid} 已触发过 fallback，跳过`);
    throw new Error('Fallback 已触发过，不再重试');
  }

  let lastError: Error | undefined;

  // 第一次尝试：使用原始模型
  try {
    console.log(`[Fallback] 第1次尝试: provider=原始, model=${modelKey}`);
    const result = await runOriginal(scope, modelKey, params, context);
    return result;
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    console.log(`[Fallback] 第1次尝试失败: ${lastError.message}`);

    // 查找 fallback 规则
    const fallbackRule = findFallbackRule(scope, modelKey);
    if (!fallbackRule) {
      console.log(`[Fallback] 未找到 fallback 规则，原样抛出错误`);
      throw lastError;
    }

    // 提取状态码
    const statusCode = extractStatusCode(lastError.message);

    // 判断是否应该触发 fallback
    const shouldFallback = shouldTriggerFallback(lastError, statusCode);
    if (!shouldFallback) {
      console.log(`[Fallback] 不满足触发条件，原样抛出错误`);
      throw lastError;
    }

    console.log(`[Fallback] 准备切换到 fallback: ${fallbackRule.fallbackProvider}/${fallbackRule.fallbackModel}`);

    // 标记为已触发
    triggeredFallbacks.add(rid);

    // 第二次尝试：使用 fallback 模型
    try {
      console.log(`[Fallback] 第2次尝试: provider=${fallbackRule.fallbackProvider}, model=${fallbackRule.fallbackModel}`);
      const result = await runOriginal(
        fallbackRule.fallbackProvider,
        fallbackRule.fallbackModel,
        params,
        context
      );

      // 在 metadata 中记录 fallback 信息
      if (result.metadata) {
        result.metadata.fallbackFrom = {
          provider: scope,
          model: modelKey,
        };
      } else {
        result.metadata = {
          fallbackFrom: {
            provider: scope,
            model: modelKey,
          },
        };
      }

      console.log(`[Fallback] 成功切换到 fallback 模型`);
      return result;
    } catch (fallbackError) {
      lastError = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
      console.log(`[Fallback] 第2次尝试也失败: ${lastError.message}`);
      throw lastError;
    }
  }
}

/**
 * 调用原始的 runByModelKey
 */
async function runOriginal(
  scope: string,
  modelKey: string,
  params: GenerateParams,
  context?: any
): Promise<GenerateResult> {
  // 动态导入避免循环依赖
  const { runByModelKey } = await import('../../models/run');
  return runByModelKey(scope as any, modelKey, params, context);
}

/**
 * 添加自定义 fallback 规则
 */
export function addFallbackRule(rule: FallbackRule): void {
  const existing = FALLBACK_RULES.findIndex(
    (r) => r.provider === rule.provider && r.model === rule.model
  );
  if (existing >= 0) {
    FALLBACK_RULES[existing] = rule;
  } else {
    FALLBACK_RULES.push(rule);
  }
  console.log(`[Fallback] 添加/更新规则: ${rule.provider}/${rule.model} -> ${rule.fallbackProvider}/${rule.fallbackModel}`);
}

/**
 * 清除所有 fallback 规则
 */
export function clearFallbackRules(): void {
  FALLBACK_RULES.length = 0;
}

/**
 * 移除特定 fallback 规则
 */
export function removeFallbackRule(provider: string, model: string): boolean {
  const index = FALLBACK_RULES.findIndex(
    (r) => r.provider === provider && r.model === model
  );
  if (index >= 0) {
    FALLBACK_RULES.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * 获取当前所有 fallback 规则
 */
export function getFallbackRules(): FallbackRule[] {
  return [...FALLBACK_RULES];
}