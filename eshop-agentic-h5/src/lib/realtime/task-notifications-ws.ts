'use client';

import { getApiMode, getNotificationsWsUrl } from '@/lib/runtime-config';

export type WsTaskPayload = {
  id?: string;
  status?: string;
  progress?: { progress?: number; error?: string; status?: string };
  metadata?: Record<string, unknown>;
  module_type?: string;
  [key: string]: unknown;
};

export type TaskWsMessage = {
  event: 'task_updated' | 'task_completed' | 'task_failed' | string;
  task: WsTaskPayload;
  notification?: unknown;
  timestamp?: string;
};

type Listener = (msg: TaskWsMessage) => void;

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'network_error']);

class TaskNotificationsWsHub {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 2000;
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    if (getApiMode() !== 'http') return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.start();
    return () => this.listeners.delete(listener);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    const url = getNotificationsWsUrl();
    if (!url || !this.started) return;

    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }

    const ws = new WebSocket(url);
    this.socket = ws;

    ws.onopen = () => {
      this.backoffMs = 2000;
    };

    ws.onmessage = (ev) => {
      try {
        const raw = JSON.parse(String(ev.data)) as {
          type?: string;
          event?: string;
          data?: { task?: WsTaskPayload; notification?: unknown };
          timestamp?: string;
        };
        if (raw.type !== 'notification' && raw.type !== 'task_update') return;
        const event = raw.event ?? '';
        if (!event.startsWith('task_')) return;
        const task = raw.data?.task;
        if (!task?.id) return;
        const msg: TaskWsMessage = {
          event,
          task,
          notification: raw.data?.notification,
          timestamp: raw.timestamp,
        };
        for (const fn of this.listeners) fn(msg);
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      this.socket = null;
      if (!this.started) return;
      this.reconnectTimer = setTimeout(() => {
        this.backoffMs = Math.min(this.backoffMs * 1.5, 30000);
        this.connect();
      }, this.backoffMs);
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}

export const taskNotificationsWs = new TaskNotificationsWsHub();

export function mapWsStatus(status: string | undefined): 'pending' | 'processing' | 'completed' | 'failed' {
  if (status === 'completed' || status === 'failed' || status === 'processing' || status === 'pending') {
    return status;
  }
  if (status === 'queued') return 'pending';
  if (status === 'cancelled' || status === 'network_error') return 'failed';
  return 'processing';
}

export function progressFromWsTask(task: WsTaskPayload): number {
  const p = task.progress?.progress;
  if (typeof p === 'number') return Math.min(100, Math.max(0, p));
  if (task.status === 'completed') return 100;
  return 0;
}

export function isTerminalWsStatus(status: string | undefined): boolean {
  return TERMINAL.has(String(status ?? ''));
}
