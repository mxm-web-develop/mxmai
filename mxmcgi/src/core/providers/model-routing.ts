/**
 * 逻辑模型到 { provider, physicalModel } 的路由配置
 * 基线：代码内默认映射；可选：admin 通过 API 覆盖（内存或 DB）
 */

import { ProviderType } from './types';

export interface RoutingEntry {
  provider: ProviderType;
  model: string;
}

/** 默认路由表：逻辑模型别名 -> { provider, model } */
const defaultRouting: Record<string, RoutingEntry> = {
  // 图文（仅业务接口：photograph / design / painting，不与模型名/子类型混用）
  'graph-photograph': { provider: 'deer', model: 'nano-banana-pro' },
  'graph-design': { provider: 'deer', model: 'nano-banana-pro' },
  'graph-painting': { provider: 'deer', model: 'nano-banana-pro' },
  // 写作（按业务类型，与 BUSINESS_INTERFACE_SPEC 一致）
  'writing-outlines': { provider: 'deer', model: 'gemini-3-pro' },
  'writing-articles': { provider: 'deer', model: 'gemini-2-5-flash' },
  'writing-lyrics': { provider: 'deer', model: 'gemini-2-5-flash' },
  'writing-voice-scripts': { provider: 'deer', model: 'gemini-2-5-flash' },
  'writing-storyboard-scripts': { provider: 'deer', model: 'gemini-2-5-flash' },
  'writing-media-post': { provider: 'deer', model: 'gemini-2-5-flash' },
  'writing-reviews': { provider: 'deer', model: 'gemini-2-5-flash' },
  'writing-resumes': { provider: 'deer', model: 'gemini-2-5-flash' },
  // 兼容旧 task 中的 model 字段（可选）
  'writing-article': { provider: 'deer', model: 'gemini-2-5-flash' },
  // 基础文本能力（内部调用）：生图提示词、写作内压缩/摘要等，统一用此逻辑模型
  'writing-basic-text': { provider: 'deer', model: 'gemini-3-pro' },
  // 音频
  'audio-speak': { provider: 'deer', model: 'minimax-speech-2.5-hd' },
  'audio-music': { provider: 'deer', model: 'suno-music' },
  // 视频（按业务类型，不使用模型名 sora/runway 作为 key）
  'video-short': { provider: 'deer', model: 'sora-2' },
  'video-movie': { provider: 'deer', model: 'sora-2' },
  'video-animation': { provider: 'deer', model: 'sora-2' },
  'video-music-video': { provider: 'deer', model: 'sora-2' },
  'video-commercial': { provider: 'deer', model: 'sora-2' },
  'video-documentary': { provider: 'deer', model: 'sora-2' },
  'video-motion-graphics': { provider: 'deer', model: 'sora-2' },
  'video-game-cg': { provider: 'deer', model: 'sora-2' },
  'video-educational': { provider: 'deer', model: 'sora-2' },
};

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
    provider: preferredProvider ?? 'deer',
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
  for (const [key, entry] of Object.entries(defaultRouting)) {
    result[key] = { ...entry, overridden: key in overrides };
  }
  for (const [key, entry] of Object.entries(overrides)) {
    if (key === 'writing-outline') {
      // 旧数据：合并到 writing-outlines
      result['writing-outlines'] = { ...entry, overridden: true };
      continue;
    }
    if (!(key in defaultRouting)) result[key] = { ...entry, overridden: true };
    else result[key] = { ...entry, overridden: true };
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
