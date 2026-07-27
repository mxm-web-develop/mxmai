/**
 * mxm-business-bundle 写入 DB 的共享实现（Admin POST /bundle/import 与 CLI 脚本共用）
 */

import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import type { BusinessBundle, BusinessBundleItem, BusinessBundleItemRouting } from './business-bundle-types';

const SCOPE_PREFIXES = ['writing', 'graph', 'video', 'audio', 'music', 'outline', 'text'] as const;

export function canonicalLogicalModel(key: string): string {
  return key === 'writing-outline' ? 'writing-outlines' : key;
}

export function parseLogicalModelToScopeParts(
  logicalModel: string
): { scope: string; task_key: string; sub_type: string } | null {
  const canonical = canonicalLogicalModel(logicalModel);
  for (const prefix of SCOPE_PREFIXES) {
    if (canonical.startsWith(`${prefix}-`)) {
      const remainder = canonical.substring(prefix.length + 1);
      const dashIndex = remainder.indexOf('-');
      const taskKey = dashIndex === -1 ? remainder : remainder.substring(0, dashIndex);
      const subType = dashIndex === -1 ? 'default' : remainder.substring(dashIndex + 1);
      const normalizedTaskKey = taskKey === 'outline' ? 'outlines' : taskKey;
      return { scope: prefix, task_key: normalizedTaskKey, sub_type: subType };
    }
  }
  return null;
}

export function getScopeRepo(scope: string) {
  switch (scope) {
    case 'graph':
      return RepositoryFactory.createGraphScopeConfigRepository();
    case 'video':
      return RepositoryFactory.createVideoScopeConfigRepository();
    case 'audio':
      return RepositoryFactory.createAudioScopeConfigRepository();
    case 'music':
      return RepositoryFactory.createMusicScopeConfigRepository();
    case 'writing':
      return RepositoryFactory.createWritingScopeConfigRepository();
    case 'outline':
      return RepositoryFactory.createOutlineScopeConfigRepository();
    case 'text':
      return RepositoryFactory.createTextScopeConfigRepository();
    default:
      return null;
  }
}

export async function buildSensitiveNameIndex(): Promise<{
  idToName: Map<string, string>;
  nameToId: Map<string, string>;
}> {
  const idToName = new Map<string, string>();
  const nameToId = new Map<string, string>();
  try {
    const repo = RepositoryFactory.createSensitiveWordRepository();
    const lists = await repo.listLists();
    for (const l of lists) {
      idToName.set(l.id, l.name);
      nameToId.set(l.name, l.id);
    }
  } catch {
    // 表未初始化等：忽略映射
  }
  return { idToName, nameToId };
}

async function upsertScopeRoutingFromBundle(
  routing: BusinessBundleItemRouting,
  nameToId: Map<string, string>,
  dryRun: boolean
): Promise<{ action: 'create' | 'update' | 'skip'; detail?: string }> {
  const parts = parseLogicalModelToScopeParts(routing.logical_model);
  if (!parts) {
    return { action: 'skip', detail: `无法解析 logical_model: ${routing.logical_model}` };
  }
  const scopeRepo = getScopeRepo(parts.scope);
  if (!scopeRepo) {
    return { action: 'skip', detail: `无 scope_repo: ${parts.scope}` };
  }
  const existing = await scopeRepo.findConfig(parts.scope, parts.task_key, parts.sub_type);
  const listIds: string[] = [];
  for (const name of routing.sensitive_word_lists ?? []) {
    const id = nameToId.get(name);
    if (id) listIds.push(id);
  }
  const dto: {
    scope: string;
    task_key: string;
    sub_type: string;
    logical_model: string;
    model: string;
    provider: string;
    enabled: boolean;
    sensitive_word_list_ids?: string[];
    margin?: number;
    charge_metric?: string;
    price_in_tokens?: number;
    min_charge_tokens?: number;
  } = {
    scope: parts.scope,
    task_key: parts.task_key,
    sub_type: parts.sub_type,
    logical_model: canonicalLogicalModel(routing.logical_model),
    model: routing.model,
    provider: routing.provider,
    enabled: routing.enabled ?? true,
    sensitive_word_list_ids: listIds.length > 0 ? listIds : undefined,
  };
  if (routing.margin !== undefined) dto.margin = routing.margin;
  if (routing.charge_metric !== undefined) dto.charge_metric = routing.charge_metric;
  if (routing.price_in_tokens !== undefined) dto.price_in_tokens = routing.price_in_tokens;
  if (routing.min_charge_tokens !== undefined) dto.min_charge_tokens = routing.min_charge_tokens;
  if (dryRun) {
    return { action: existing ? 'update' : 'create' };
  }
  await scopeRepo.upsertConfig(dto);

  const supabase = getSupabaseClient();
  const tableMap: Record<string, string> = {
    writing: 'writing_scope_config',
    graph: 'graph_scope_config',
    video: 'video_scope_config',
    audio: 'audio_scope_config',
    music: 'music_scope_config',
    outline: 'outline_scope_config',
    text: 'text_scope_config',
  };
  const tableName = tableMap[parts.scope];
  if (tableName === 'text_scope_config') {
    const lm = canonicalLogicalModel(routing.logical_model);
    const { error } = await supabase
      .from(tableName)
      .update({ logical_model: lm, updated_at: new Date().toISOString() })
      .eq('scope', parts.scope)
      .eq('task_key', parts.task_key)
      .eq('sub_type', parts.sub_type);
    if (error) {
      console.warn('[business-bundle-import] text_scope_config logical_model update:', error.message);
    }
  }

  return { action: existing ? 'update' : 'create' };
}

async function findBusinessPricingId(row: {
  business_type: string;
  charge_metric: string;
  provider?: string | null;
  model_key?: string | null;
  subtype?: string | null;
}): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data: rows } = await supabase
    .from('business_pricing')
    .select('id,provider,model_key,subtype')
    .eq('business_type', row.business_type)
    .eq('charge_metric', row.charge_metric);
  if (!rows?.length) return null;
  const p = row.provider ?? null;
  const m = row.model_key ?? null;
  const s = row.subtype ?? null;
  const hit = rows.find((r: Record<string, unknown>) => {
    const rp = r.provider == null ? null : String(r.provider);
    const rm = r.model_key == null ? null : String(r.model_key);
    const rs = r.subtype == null ? null : String(r.subtype);
    return rp === p && rm === m && rs === s;
  });
  return hit && typeof (hit as { id?: string }).id === 'string' ? (hit as { id: string }).id : null;
}

async function upsertBusinessPricingRow(
  row: NonNullable<BusinessBundleItem['businessPricing']>[number],
  dryRun: boolean
): Promise<'create' | 'update'> {
  const supabase = getSupabaseClient();
  const existingId = await findBusinessPricingId(row);
  if (dryRun) {
    return existingId ? 'update' : 'create';
  }
  const provider = row.provider ?? null;
  const modelKey = row.model_key ?? null;
  const subtype = row.subtype ?? null;
  if (existingId) {
    await supabase
      .from('business_pricing')
      .update({
        price_in_tokens: row.price_in_tokens,
        min_charge_tokens: row.min_charge_tokens ?? 0,
        metadata: row.metadata ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId);
    return 'update';
  }
  await supabase.from('business_pricing').insert({
    business_type: row.business_type,
    charge_metric: row.charge_metric,
    price_in_tokens: row.price_in_tokens,
    min_charge_tokens: row.min_charge_tokens ?? 0,
    provider,
    model_key: modelKey,
    subtype,
    metadata: row.metadata ?? null,
  });
  return 'create';
}

export type ApplyMxmBusinessBundleResult = {
  created: string[];
  updated: string[];
  skipped: string[];
  warnings: string[];
};

/**
 * 将 bundle 写入 prompt_engineering_config、*_scope_config、business_pricing（与 Admin import 一致）
 */
export async function applyMxmBusinessBundleImport(params: {
  bundle: BusinessBundle;
  conflictPolicy: 'upsert' | 'skip' | 'dry-run';
  userId?: string | null;
}): Promise<ApplyMxmBusinessBundleResult> {
  const { bundle, conflictPolicy, userId = null } = params;
  const policy = conflictPolicy;
  const dryRun = policy === 'dry-run';
  const promptRepo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const { nameToId } = await buildSensitiveNameIndex();

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const raw of bundle.items) {
    const key = `${raw.scope}/${raw.type}/${raw.subtype ?? ''}`;
    if (!raw.scope || !raw.type) {
      warnings.push(`跳过无效项: ${key}`);
      continue;
    }

    const existing = await promptRepo.findByKey(raw.scope, raw.type, raw.subtype ?? null);
    if (policy === 'skip' && existing) {
      skipped.push(key);
      continue;
    }

    if (raw.linkedTextFormat) {
      const lf = raw.linkedTextFormat;
      const lk = `${lf.scope}/${lf.type}/${lf.subtype ?? ''}`;
      const exL = await promptRepo.findByKey(lf.scope, lf.type, lf.subtype ?? null);
      if (dryRun) {
        if (exL) updated.push(`linked:${lk}`);
        else created.push(`linked:${lk}`);
      } else {
        await promptRepo.upsert({
          scope: lf.scope,
          type: lf.type,
          subtype: lf.subtype ?? null,
          rules_i18n: lf.rules_i18n ?? {},
          output_format_i18n: lf.output_format_i18n ?? {},
          form_options_i18n: lf.form_options_i18n ?? null,
          extra: lf.extra ?? null,
          is_active: lf.is_active !== false,
          updated_by: userId,
        });
        if (exL) updated.push(`linked:${lk}`);
        else created.push(`linked:${lk}`);
      }
    }

    if (dryRun) {
      if (existing) updated.push(key);
      else created.push(key);
    } else {
      await promptRepo.upsert({
        scope: raw.scope,
        type: raw.type,
        subtype: raw.subtype ?? null,
        rules_i18n: raw.rules_i18n ?? {},
        output_format_i18n: raw.output_format_i18n ?? {},
        form_options_i18n: raw.form_options_i18n ?? null,
        extra: raw.extra ?? null,
        is_active: raw.is_active !== false,
        updated_by: userId,
      });
      if (existing) updated.push(key);
      else created.push(key);
    }

    if (raw.routing) {
      const missing: string[] = [];
      for (const name of raw.routing.sensitive_word_lists ?? []) {
        if (!nameToId.has(name)) missing.push(name);
      }
      if (missing.length) {
        warnings.push(`${key}: 未找到敏感词库名称（已忽略 ID 绑定）: ${missing.join(', ')}`);
      }
      const scopeParts = parseLogicalModelToScopeParts(raw.routing.logical_model);
      const scopeRepo = scopeParts ? getScopeRepo(scopeParts.scope) : null;
      const existingRoute =
        scopeRepo && scopeParts
          ? await scopeRepo.findConfig(scopeParts.scope, scopeParts.task_key, scopeParts.sub_type)
          : null;
      if (existingRoute && !dryRun) {
        warnings.push(
          `${key}: 已存在 scope 路由（${raw.routing.logical_model}），跳过 bundle.routing，保留 Admin 中的 provider/model`
        );
      } else {
        const r = await upsertScopeRoutingFromBundle(raw.routing, nameToId, dryRun);
        if (r.detail && r.action === 'skip') warnings.push(`${key} routing: ${r.detail}`);
        else if (dryRun) {
          if (existingRoute) updated.push(`routing:${raw.routing.logical_model}`);
          else created.push(`routing:${raw.routing.logical_model}`);
        } else if (r.action === 'create') created.push(`routing:${raw.routing.logical_model}`);
        else if (r.action === 'update') updated.push(`routing:${raw.routing.logical_model}`);
      }
    }

    if (raw.businessPricing?.length) {
      for (const pr of raw.businessPricing) {
        const pk = `${pr.business_type}/${pr.charge_metric}`;
        const act = await upsertBusinessPricingRow(pr, dryRun);
        if (act === 'create') created.push(`pricing:${pk}`);
        else updated.push(`pricing:${pk}`);
      }
    }
  }

  return { created, updated, skipped, warnings };
}
