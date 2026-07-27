/**
 * Provider 用量 / 扣费：将 Provider 返回的 metadata.model（可能是 protocol 名）
 * 解析为 provider_pricing 使用的 model_key（provider_models.model_key）。
 */

import type { ProviderType } from '../../models/providers';
import { findEnabledModelWithReload } from '../../models/provider-model-catalog';
import { isProtocolLikeModelKey } from '../../routes/provider-connectivity-test';

const KNOWN_SCOPES = new Set([
  'writing',
  'outline',
  'graph',
  'image',
  'audio',
  'music',
  'video',
  'text',
]);

export function inferUsageScope(
  metadata: Record<string, unknown>,
  opts?: { taskType?: string; logicalModel?: string }
): string {
  const taskTypeRaw = opts?.taskType ?? metadata.taskType ?? metadata.task_type;
  if (typeof taskTypeRaw === 'string') {
    const t = taskTypeRaw.trim().toLowerCase();
    if (KNOWN_SCOPES.has(t)) return t === 'image' ? 'graph' : t;
  }

  if (metadata.videoTaskKey || metadata.videoSubtype || metadata.seedanceMode) {
    return 'video';
  }

  const modelKey = String(opts?.logicalModel ?? metadata.model ?? '');
  if (modelKey.startsWith('writing-')) return 'writing';
  if (modelKey.startsWith('outline-')) return 'outline';
  if (modelKey.startsWith('graph-') || modelKey.startsWith('image-')) return 'graph';
  if (modelKey.startsWith('audio-')) return 'audio';
  if (modelKey.startsWith('music-')) return 'music';
  if (modelKey.startsWith('video-')) return 'video';
  if (modelKey.startsWith('text-')) return 'text';

  const scopeHint = metadata.scope;
  if (typeof scopeHint === 'string' && KNOWN_SCOPES.has(scopeHint.trim().toLowerCase())) {
    const s = scopeHint.trim().toLowerCase();
    return s === 'image' ? 'graph' : s;
  }

  return 'text';
}

function collectModelCandidates(
  metadata: Record<string, unknown>,
  logicalModel?: string
): string[] {
  const raw = [
    logicalModel,
    metadata.logicalModel,
    metadata.upstream,
    metadata.model,
  ];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/**
 * 解析 provider_pricing / provider_usage_records 使用的 model_key。
 */
export async function resolveUsagePricingModelKey(
  provider: ProviderType,
  metadata: Record<string, unknown>,
  logicalModel?: string,
  scopeHint?: string
): Promise<string> {
  const candidates = collectModelCandidates(metadata, logicalModel);

  for (const c of candidates) {
    if (isProtocolLikeModelKey(c)) continue;
    const row = await findEnabledModelWithReload({
      modelKey: c,
      scope: scopeHint,
      provider,
    });
    if (row) return row.model_key;
  }

  for (const c of candidates) {
    if (!isProtocolLikeModelKey(c)) return c;
  }

  return 'unknown';
}
