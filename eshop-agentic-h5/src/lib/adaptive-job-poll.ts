'use client';

import { getApiMode } from '@/lib/runtime-config';
import { taskNotificationsWs } from '@/lib/realtime/task-notifications-ws';

/** integration Key / 离线模式 */
export const FALLBACK_POLL_MS = 8000;
/** 无法用 WS 时必须 HTTP 轮询 */
export const ACTIVE_JOB_POLL_MS = 3000;
/** personal Key + WS 已连接时的兜底轮询 */
export const WS_BACKUP_POLL_MS = 30_000;

export function resolveActiveJobPollMs(): number {
  if (getApiMode() !== 'http') return FALLBACK_POLL_MS;
  if (taskNotificationsWs.isConnected()) return WS_BACKUP_POLL_MS;
  return ACTIVE_JOB_POLL_MS;
}
