import { getStoredToken } from '../api/client';
import { buildNotificationsWebSocketUrl } from '../utils/gateway-ws';
import {
  type CgiTaskWsMessage,
  parseCgiTaskWsMessage,
} from './task-snapshot';

export type TaskNotificationListener = (msg: CgiTaskWsMessage) => void;

type ConnState = 'disconnected' | 'connecting' | 'connected';

let ws: WebSocket | null = null;
let state: ConnState = 'disconnected';
let attempt = 0;
let stopped = true;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<TaskNotificationListener>();

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  clearReconnect();
  if (stopped || listeners.size === 0) return;
  attempt += 1;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  if (stopped || listeners.size === 0) return;
  const token = getStoredToken();
  if (!token) {
    scheduleReconnect();
    return;
  }

  let url: string;
  try {
    url = buildNotificationsWebSocketUrl(token);
  } catch {
    scheduleReconnect();
    return;
  }

  state = 'connecting';
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    state = 'connected';
    attempt = 0;
  };

  ws.onmessage = (ev) => {
    try {
      const parsed = parseCgiTaskWsMessage(JSON.parse(String(ev.data)) as unknown);
      if (!parsed) return;
      listeners.forEach((fn) => {
        try {
          fn(parsed);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    ws = null;
    state = 'disconnected';
    if (!stopped) scheduleReconnect();
  };

  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      // ignore
    }
  };
}

function ensureStarted(): void {
  if (!stopped) return;
  stopped = false;
  connect();
}

function teardownIfIdle(): void {
  if (listeners.size > 0) return;
  stopped = true;
  clearReconnect();
  state = 'disconnected';
  try {
    ws?.close();
  } catch {
    // ignore
  }
  ws = null;
}

/** 订阅 CGI 任务 WS 事件；返回取消函数 */
export function subscribeTaskNotifications(listener: TaskNotificationListener): () => void {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
    teardownIfIdle();
  };
}

export function getTaskNotificationConnectionState(): ConnState {
  return state;
}
