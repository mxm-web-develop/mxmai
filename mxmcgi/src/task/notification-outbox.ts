/**
 * 任务事件 Outbox（最小可用实现）
 * - 先落库（outbox），再尝试投递到 mxmnotify
 * - 投递失败会保留记录，后台循环重试
 *
 * 约定：
 * - mxmcgi 是 task event 的唯一权威源
 * - 下游（mxmnotify）应以 event_id 做幂等（重复投递可安全忽略）
 */

import { getSupabaseClient } from '@mxmai/mxmdata';
import type { TaskStatus, TaskType } from './types';

export interface TaskStatusChangedEvent {
  event_id: string;
  event_ts: string; // ISO string
  module_type: 'mxmcgi';
  task_id: string;
  user_id: string;
  task_status: TaskStatus;
  task_status_message?: string;
  metadata: Record<string, any>;
  notification_config?: Record<string, any>;
}

const MXMNOTIFY_URL = process.env.MXMNOTIFY_URL || 'http://localhost:4005';

function nowIso(): string {
  return new Date().toISOString();
}

function generateEventId(): string {
  // Node 18+ 支持 randomUUID；兜底用时间戳+随机
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto');
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildTaskStatusChangedEvent(input: {
  taskId: string;
  userId: string;
  status: TaskStatus;
  statusMessage?: string;
  taskType: TaskType;
  modelName: string;
  modelProvider: string;
  progress?: number;
  error?: string;
  // completed 时可选
  result?: { mediaUrls?: string[]; storageInfo?: any };
  notification_config?: Record<string, any>;
}): TaskStatusChangedEvent {
  const event_id = generateEventId();
  const event_ts = nowIso();

  const metadata: Record<string, any> = {
    task_type: input.taskType,
    model_name: input.modelName,
    model_provider: input.modelProvider,
    progress: input.progress,
    error: input.error,
  };

  if (input.status === 'completed' && input.result) {
    metadata.media_count = input.result.mediaUrls?.length || 0;
    metadata.result = {
      mediaUrls: input.result.mediaUrls,
      storageInfo: input.result.storageInfo,
    };
  }

  return {
    event_id,
    event_ts,
    module_type: 'mxmcgi',
    task_id: input.taskId,
    user_id: input.userId,
    task_status: input.status,
    task_status_message: input.statusMessage,
    metadata,
    notification_config: input.notification_config,
  };
}

export async function enqueueOutboxEvent(event: TaskStatusChangedEvent): Promise<void> {
  // 若 supabase 不可用，直接抛出；调用方会降级为“尽力投递”
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('task_event_outbox').insert({
    event_id: event.event_id,
    module_type: event.module_type,
    task_id: event.task_id,
    user_id: event.user_id,
    task_status: event.task_status,
    payload: event as any,
    attempts: 0,
    created_at: event.event_ts,
  });
  if (error) {
    throw new Error(`outbox insert failed: ${error.message}`);
  }
}

export async function markOutboxSent(eventId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('task_event_outbox')
    .update({ sent_at: nowIso() })
    .eq('event_id', eventId);
  if (error) throw new Error(`outbox update sent_at failed: ${error.message}`);
}

export async function incrementOutboxAttempt(eventId: string, lastError: string): Promise<void> {
  const supabase = getSupabaseClient();
  // supabase-js 不支持原子自增（除非 rpc），这里用 select+update 的简化版本
  const { data, error: getError } = await supabase
    .from('task_event_outbox')
    .select('attempts')
    .eq('event_id', eventId)
    .maybeSingle();
  if (getError) throw new Error(`outbox get attempts failed: ${getError.message}`);
  const attempts = (data?.attempts ?? 0) + 1;
  const { error: updateError } = await supabase
    .from('task_event_outbox')
    .update({ attempts, last_error: lastError, updated_at: nowIso() })
    .eq('event_id', eventId);
  if (updateError) throw new Error(`outbox update attempts failed: ${updateError.message}`);
}

export async function deliverToMxmnotify(event: TaskStatusChangedEvent): Promise<void> {
  const resp = await fetch(`${MXMNOTIFY_URL}/task-events/status-changed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`mxmnotify responded ${resp.status}: ${text}`);
  }
}

export interface OutboxProcessorOptions {
  intervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
}

export class TaskEventOutboxProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(opts: OutboxProcessorOptions = {}) {
    this.intervalMs = opts.intervalMs ?? 3000;
    this.batchSize = opts.batchSize ?? 30;
    this.maxAttempts = opts.maxAttempts ?? 20;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch(() => {
        // 不抛出，避免崩掉循环
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('task_event_outbox')
        .select('event_id,payload,attempts,sent_at')
        .is('sent_at', null)
        .lt('attempts', this.maxAttempts)
        .order('created_at', { ascending: true })
        .limit(this.batchSize);
      if (error) return;
      const rows = (data || []) as any[];
      if (rows.length === 0) return;

      for (const row of rows) {
        const eventId = row.event_id as string;
        const payload = row.payload as TaskStatusChangedEvent;
        try {
          await deliverToMxmnotify(payload);
          await markOutboxSent(eventId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          try {
            await incrementOutboxAttempt(eventId, msg);
          } catch {
            // ignore
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}

