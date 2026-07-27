/**
 * 逻辑模型到 { provider, physicalModel } 的路由配置
 * 纯动态：仅允许 admin/DB 覆盖（内存或 DB），不再提供代码内默认映射
 */

import { ProviderType } from './types';
import { resolveDefaultLlmProvider } from '../../config/default-llm';

export interface RoutingEntry {
  provider: ProviderType;
  model: string;
}

/** 默认路由表：纯动态模式下为空（只保留 admin/DB 覆盖） */
const defaultRouting: Record<string, RoutingEntry> = {};

/** 内存覆盖（admin 通过 API 更新时写入，可选后续改为 DB） */
const overrides: Record<string, RoutingEntry> = {};

/**
 * 解析逻辑模型名得到 provider + 物理模型名
 * - 若存在路由（默认或覆盖），返回对应 provider 与 model
 * - 若 preferredProvider 指定且路由中存在该 key，可优先用 preferredProvider 覆盖 provider（可选）
 * - 否则将 logicalOrPhysicalName 视为物理模型名，provider 由调用方通过 getProviderForModel 决定
 */
/** 大纲业务 key 别名：writing-outline（已废弃）解析时映射到 writing-outlines */
const OUTLINE_ROUTING_ALIAS: Record<string, string> = {
  'writing-outline': 'writing-outlines',
};

export function getResolvedRouting(
  logicalOrPhysicalName: string,
  preferredProvider?: ProviderType
): { provider: ProviderType; model: string; fromRouting: boolean } {
  // 大纲：writing-outline（已废弃）解析到 writing-outlines
  const lookupKey = OUTLINE_ROUTING_ALIAS[logicalOrPhysicalName] ?? logicalOrPhysicalName;
  const entry =
    overrides[logicalOrPhysicalName] ??
    overrides[lookupKey] ??
    defaultRouting[logicalOrPhysicalName] ??
    defaultRouting[lookupKey];
  if (entry) {
    const provider = preferredProvider ?? entry.provider;
    return {
      provider,
      model: entry.model,
      fromRouting: true,
    };
  }
  // 未命中路由：视为物理模型名，provider 由 factory 根据 support list 决定
  return {
    // 注意：当 fromRouting=false 时，provider 字段不应被用于强制选择；
    // ProviderFactory.getProviderAndModel 会用调用方的 preferredProvider 决定是否限定。
    provider: preferredProvider ?? resolveDefaultLlmProvider(),
    model: logicalOrPhysicalName,
    fromRouting: false,
  };
}

/**
 * 获取当前完整路由表（默认 + 覆盖），供 admin 查询
 * 过滤 writing-outline（已废弃），仅返回 writing-outlines
 */
export function getFullRoutingTable(): Record<string, RoutingEntry & { overridden?: boolean }> {
  const result: Record<string, RoutingEntry & { overridden?: boolean }> = {};
  // 纯动态模式：默认路由为空，仅展示覆盖
  for (const [key, entry] of Object.entries(overrides)) {
    if (key === 'writing-outline') {
      // 旧数据：合并到 writing-outlines
      result['writing-outlines'] = { ...entry, overridden: true };
      continue;
    }
    result[key] = { ...entry, overridden: true };
  }
  return result;
}

/**
 * 设置路由覆盖（仅内存；仅 admin 可调用）
 * writing-outline（已废弃）统一规范为 writing-outlines
 */
export function setRoutingOverride(logicalModel: string, entry: RoutingEntry): void {
  const key = logicalModel === 'writing-outline' ? 'writing-outlines' : logicalModel;
  overrides[key] = entry;
}

/**
 * 清除单条路由覆盖（writing-outline 规范为 writing-outlines 后清除）
 */
export function clearRoutingOverride(logicalModel: string): void {
  const key = logicalModel === 'writing-outline' ? 'writing-outlines' : logicalModel;
  delete overrides[key];
}

/**
 * 清除所有覆盖
 */
export function clearAllOverrides(): void {
  Object.keys(overrides).forEach((k) => delete overrides[k]);
}

export { defaultRouting };
