/**
 * 把 hk-provider-modalities.ts 里的 supported_inputs/outputs/modes 幂等 patch 到
 * 生产 provider_models.capabilities。**只更新 capabilities 字段，不动其它列**。
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run sync:modality-capacities
 *
 * 生产：
 *   bash scripts/sync-modality-capacities-production.sh
 *
 * 行为：
 *   - 列出 HK 在线 provider × model_key 范围（atlascloud + maxplan + jiekou）
 *   - 对每条记录按 (provider, scope, model_key) 查找当前 row
 *   - 合并新旧 capabilities：保留旧 input/output/context_window/vector_dim 等，
 *     覆盖写入 supported_inputs/supported_outputs/modes
 *   - 输出"哪个模型补了什么"报告
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { refreshProviderModelCatalog } from '../models/provider-model-catalog';
import {
  HK_ALL_PROVIDER_MODALITIES,
  toCapabilities,
  type HkModelCapabilities,
} from './data/hk-provider-modalities';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) return;

  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error(
      'MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL（请用 scripts/sync-modality-capacities-production.sh）',
    );
  }

  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [
    path.join(projectRoot, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(projectRoot, 'mxmcgi', '.env'),
  ]) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }

  const url = process.env.SUPABASE_URL ?? '';
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    console.warn(
      '⚠️  当前 SUPABASE_URL 指向本地 PostgREST，Admin 生产环境看不到变更。\n' +
        '    请执行: bash scripts/sync-modality-capacities-production.sh',
    );
  }
}

/** 把"集中表里的双写 capabilities"合并到已有 capabilities 上 */
function mergeCapabilities(
  existing: Record<string, unknown> | null,
  fresh: HkModelCapabilities,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  const freshCap = toCapabilities(fresh);
  // 双写字段：拍平 + 嵌套都从 fresh 覆盖
  merged.supported_inputs = freshCap.supported_inputs;
  merged.supported_outputs = freshCap.supported_outputs;
  merged.input = freshCap.input;
  merged.output = freshCap.output;
  if (freshCap.modes) merged.modes = freshCap.modes;
  if (fresh.context_window != null) merged.context_window = fresh.context_window;
  if (fresh.max_output_tokens != null) merged.max_output_tokens = fresh.max_output_tokens;
  if (fresh.vector_dim != null) merged.vector_dim = fresh.vector_dim;
  return merged;
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const url = process.env.SUPABASE_URL ?? '';
  console.log('目标 Supabase:', url.includes('supabase.co') ? url : url || '(未设置)');
  console.log(`HK 在线模型集中表共 ${HK_ALL_PROVIDER_MODALITIES.length} 条`);

  const repo = RepositoryFactory.createProviderModelRepository();

  // 因为同一 model_key 可能在多个 scope 下（例如 atlascloud 的 LLM 同时 text+writing），
  // 这里按 provider 分组后逐个 (provider, scope, model_key) 精确更新。
  // 已知 scope 范围从集中表无法推，所以对同一 provider+model_key 列出所有 scope 行。
  const allRows = await repo.list({ onlyEnabled: true });

  let updated = 0;
  let missing = 0;
  const changes: Array<{
    provider: string;
    scope: string;
    model_key: string;
    inputs: string[];
    outputs: string[];
    modes?: string[];
  }> = [];

  for (const item of HK_ALL_PROVIDER_MODALITIES) {
    // 找同 provider+model_key 的所有 scope
    const matched = allRows.filter(
      (r) => r.provider === item.provider && r.model_key === item.model_key,
    );
    if (matched.length === 0) {
      console.log(`⚠️  未在 DB 找到: ${item.provider}/${item.model_key}（可忽略，可能是已下架或未 seed）`);
      missing += 1;
      continue;
    }
    for (const row of matched) {
      const merged = mergeCapabilities(
        (row.capabilities as Record<string, unknown> | null) ?? null,
        item.capability,
      );
      const prev = row.capabilities ?? {};
      const changed = JSON.stringify(prev) !== JSON.stringify(merged);
      if (changed) {
        await repo.update(row.id, { capabilities: merged });
        updated += 1;
        console.log(
          `✅ [${row.scope}] ${row.provider}/${row.model_key} ` +
            `→ inputs=[${item.capability.supported_inputs.join(',')}] ` +
            `outputs=[${item.capability.supported_outputs.join(',')}]` +
            (item.capability.modes ? ` modes=[${item.capability.modes.join(',')}]` : ''),
        );
      } else {
        console.log(`   = [${row.scope}] ${row.provider}/${row.model_key} 无变化`);
      }
      changes.push({
        provider: row.provider,
        scope: row.scope,
        model_key: row.model_key,
        inputs: item.capability.supported_inputs,
        outputs: item.capability.supported_outputs,
        modes: item.capability.modes,
      });
    }
  }

  // 报告
  console.log('\n=== Sync 报告 ===');
  console.log(`集中表条目: ${HK_ALL_PROVIDER_MODALITIES.length}`);
  console.log(`DB 实际更新: ${updated}`);
  console.log(`DB 中无对应行: ${missing}`);
  console.log('--- 能力分布 ---');
  const dist = new Map<string, number>();
  for (const c of changes) {
    const key = `${c.inputs.join(',')} → ${c.outputs.join(',')}`;
    dist.set(key, (dist.get(key) ?? 0) + 1);
  }
  for (const [k, v] of Array.from(dist.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}×  ${k}`);
  }

  await refreshProviderModelCatalog();
  console.log('\n已 reload 内存 provider_model catalog。');
}

main().catch((e) => {
  console.error('sync-modality-capacities failed:', e);
  process.exit(1);
});
