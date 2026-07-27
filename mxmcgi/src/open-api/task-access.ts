/** Open API 第三方调用方对任务的访问判定（含 Partner 终端用户隔离） */

export function resolveOpenApiCallerFromTask(
  requestParams: unknown,
  metadata: unknown
): string | undefined {
  const rp = requestParams as Record<string, unknown> | undefined;
  const meta = metadata as Record<string, unknown> | undefined;
  const c =
    (typeof rp?.callerUserId === 'string' && rp.callerUserId) ||
    (typeof rp?.openApiCallerId === 'string' && rp.openApiCallerId) ||
    (typeof meta?.openApiCallerId === 'string' && meta.openApiCallerId);
  return c || undefined;
}

export function resolvePartnerEndUserFromTask(
  requestParams: unknown,
  metadata: unknown
): string | undefined {
  const rp = requestParams as Record<string, unknown> | undefined;
  const meta = metadata as Record<string, unknown> | undefined;
  const id =
    (typeof rp?.endUserId === 'string' && rp.endUserId) ||
    (typeof meta?.endUserId === 'string' && meta.endUserId);
  return id || undefined;
}

/** 当前用户是否可读取该任务（含媒体代理、Open API getJob） */
export function canUserAccessTask(
  task: { requestParams?: unknown; metadata?: Record<string, unknown> | null },
  userId: string,
  opts?: { isAdmin?: boolean; publishedOwnerId?: string; partnerEndUserId?: string }
): boolean {
  if (opts?.isAdmin) return true;
  const ownerId = task.metadata?.userId;
  const openCaller = resolveOpenApiCallerFromTask(task.requestParams, task.metadata);
  const taskEndUser = resolvePartnerEndUserFromTask(task.requestParams, task.metadata);

  if (opts?.partnerEndUserId) {
    if (taskEndUser && taskEndUser === opts.partnerEndUserId) return true;
    if (taskEndUser && taskEndUser !== opts.partnerEndUserId) return false;
  }

  if (userId === openCaller) {
    if (opts?.partnerEndUserId && taskEndUser && taskEndUser !== opts.partnerEndUserId) {
      return false;
    }
    return true;
  }
  if (typeof ownerId === 'string' && ownerId === userId) return true;
  if (opts?.publishedOwnerId && opts.publishedOwnerId === userId) return true;
  return false;
}

export function canPartnerAccessStorageMetadata(
  recordMetadata: Record<string, unknown> | null | undefined,
  partner: { partnerAppId: string; endUserId: string } | null
): boolean {
  if (!partner) return true;
  const meta = recordMetadata ?? {};
  const appId = typeof meta.partner_app_id === 'string' ? meta.partner_app_id : undefined;
  const endId = typeof meta.end_user_id === 'string' ? meta.end_user_id : undefined;
  if (!appId && !endId) return true;
  if (appId && appId !== partner.partnerAppId) return false;
  if (endId && endId !== partner.endUserId) return false;
  return true;
}
