import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PublishedApiRecord } from '@mxmai/mxmdata';
import type { OpenApiRunContext } from './context';

export async function logOpenApiInvocation(
  record: PublishedApiRecord,
  ctx: OpenApiRunContext,
  jobId: string,
  kind: 'task_v2' | 'smartflow',
  title?: string | null
): Promise<void> {
  try {
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    await repo.create({
      publishedApiId: record.id,
      slug: record.slug,
      ownerUserId: record.owner_user_id,
      callerUserId: ctx.callerUserId,
      partnerAppId: ctx.partnerAppId ?? null,
      endUserId: ctx.endUserId ?? null,
      jobId,
      kind,
      title: title ?? null,
    });
  } catch (e) {
    console.warn('[OpenApi] log invocation failed:', e instanceof Error ? e.message : e);
  }
}

export async function completeOpenApiUsage(jobId: string, tokensCharged: number): Promise<void> {
  try {
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    const existing = await repo.findByJobId(jobId);
    const accumulated = (existing?.tokens_charged ?? 0) + tokensCharged;
    await repo.markCompleted(jobId, accumulated);
  } catch (e) {
    console.warn('[OpenApi] complete usage failed:', e instanceof Error ? e.message : e);
  }
}

/** Smartflow 完成后：汇总发布者近期该 slug 的 wallet 扣费写入 invocation */
export async function finalizeSmartflowOpenApiUsage(
  executionId: string,
  ownerUserId: string,
  publishedSlug: string,
  sinceIso: string
): Promise<void> {
  try {
    const { getSupabaseClient } = await import('@mxmai/mxmdata');
    const client = getSupabaseClient();
    const assetCode = process.env.PLATFORM_TOKEN_ASSET_CODE || 'MXM-TOKEN';
    const { data: rows, error } = await client
      .from('wallet_transactions')
      .select('amount, metadata, created_at')
      .eq('user_id', ownerUserId)
      .eq('asset_code', assetCode)
      .eq('type', 'withdraw')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    let sum = 0;
    for (const r of rows ?? []) {
      const meta = r.metadata as Record<string, unknown> | null;
      if (meta?.published_slug !== publishedSlug && meta?.source !== 'open_api') continue;
      sum += Math.abs(Number(r.amount ?? 0));
    }
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    await repo.markCompleted(executionId, sum);
  } catch (e) {
    console.warn('[OpenApi] finalize smartflow usage failed:', e instanceof Error ? e.message : e);
  }
}

export async function failOpenApiUsage(jobId: string, message?: string): Promise<void> {
  try {
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    await repo.markFailed(jobId, message);
  } catch (e) {
    console.warn('[OpenApi] fail usage failed:', e instanceof Error ? e.message : e);
  }
}
