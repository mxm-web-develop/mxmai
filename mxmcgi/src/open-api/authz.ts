import type { Request } from 'express';
import type { PublishedApiRecord } from '@mxmai/mxmdata';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { smartflowRepository } from '../smartflow/core/engine/repository';
import { loadTaskDefinition } from '../tasks/task-definition';
import type { TaskScope } from '../tasks/types';
import {
  buildPublishedInputSchema,
  buildSnapshotForSmartflowStart,
  findSmartflowStartNode,
} from './schema-builder';

export async function isAdminUser(req: Request): Promise<boolean> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') return true;
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) return false;
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    return !!(user && user.role === 'admin');
  } catch {
    return false;
  }
}

export function requireUserId(req: Request): string | null {
  const id = req.headers['x-user-id'] as string | undefined;
  return id && id.trim() ? id.trim() : null;
}

export interface PartnerRequestContext {
  partnerAppId: string;
  endUserId: string;
}

export function getPartnerContext(req: Request): PartnerRequestContext | null {
  const partnerAppId = (req.headers['x-partner-app-id'] as string | undefined)?.trim();
  const endUserId = (req.headers['x-partner-end-user-id'] as string | undefined)?.trim();
  if (!partnerAppId || !endUserId) return null;
  return { partnerAppId, endUserId };
}

export async function assertCanPublishSmartflow(
  smartflowId: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const sf = await smartflowRepository.findById(smartflowId);
  if (!sf) throw new Error('Smartflow 不存在');
  if (!isAdmin && sf.author_id && sf.author_id !== userId) {
    throw new Error('无权发布该 Smartflow（非所有者）');
  }
  const status = sf.status ?? 'active';
  if (status !== 'active' && !isAdmin) {
    throw new Error('Smartflow 须为 active 状态方可发布');
  }
}

export async function assertCanManagePublishedApi(
  record: PublishedApiRecord,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  if (isAdmin) return;
  if (record.owner_user_id !== userId) {
    throw new Error('无权操作该发布记录');
  }
}

export async function buildSnapshotForTaskV2(params: {
  scope: string;
  taskKey: string;
  subtype?: string | null;
}) {
  const { template, row } = await loadTaskDefinition({
    scope: params.scope as TaskScope,
    taskKey: params.taskKey,
    subtype: params.subtype ?? null,
  });
  if ((row as { is_active?: boolean }).is_active === false) {
    throw new Error('业务配置已禁用，无法发布');
  }
  return buildPublishedInputSchema(template.formSchema);
}

export async function buildSnapshotForSmartflow(smartflowId: string) {
  const sf = await smartflowRepository.findById(smartflowId);
  if (!sf) throw new Error('Smartflow 不存在');
  const start = findSmartflowStartNode(sf.schema as { nodes?: unknown[] });
  return buildSnapshotForSmartflowStart(start);
}

export async function refreshPublishedSnapshots(record: PublishedApiRecord) {
  if (record.kind === 'task_v2') {
    if (!record.task_v2_scope || !record.task_v2_task_key) {
      throw new Error('task_v2 发布记录缺少 scope/taskKey');
    }
    return buildSnapshotForTaskV2({
      scope: record.task_v2_scope,
      taskKey: record.task_v2_task_key,
      subtype: record.task_v2_subtype,
    });
  }
  if (!record.smartflow_id) throw new Error('smartflow 发布记录缺少 smartflow_id');
  return buildSnapshotForSmartflow(record.smartflow_id);
}
