import { useEffect, useRef } from 'react';
import { getTask, type WritingTaskItem } from '../api/client';
import { invalidateTaskListCache } from '../api/client';
import { subscribeTaskNotifications } from '../notifications/task-notifications';
import {
  extractCgiTaskFromApiResponse,
  extractFullCgiTaskFromApiResponse,
  isTerminalTaskStatus,
  wsPayloadToWritingTaskItem,
} from '../notifications/task-snapshot';

/** 无推送时的兜底全量刷新间隔 */
export const DEFAULT_TASK_LIST_SLOW_POLL_MS = 120_000;

/**
 * WebSocket 增量 patch 列表；慢轮询仅作断线兜底。
 */
export function useGatewayTaskListSync(options: {
  enabled: boolean;
  onTaskPatch: (patch: WritingTaskItem) => void;
  /** 列表中尚无该任务时拉取完整行（如新建 pending） */
  onTaskMissing?: (taskId: string) => void;
  /** 终态后拉一次全量任务（含 result），默认内部 getTask */
  onTaskTerminal?: (taskId: string, patch: WritingTaskItem) => void | Promise<void>;
  slowPollRefresh?: () => void;
  slowPollMs?: number;
}): void {
  const {
    enabled,
    onTaskPatch,
    onTaskMissing,
    onTaskTerminal,
    slowPollRefresh,
    slowPollMs = DEFAULT_TASK_LIST_SLOW_POLL_MS,
  } = options;

  const onTaskPatchRef = useRef(onTaskPatch);
  const onTaskMissingRef = useRef(onTaskMissing);
  const onTaskTerminalRef = useRef(onTaskTerminal);
  const slowPollRef = useRef(slowPollRefresh);
  const terminalFetchingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onTaskPatchRef.current = onTaskPatch;
    onTaskMissingRef.current = onTaskMissing;
    onTaskTerminalRef.current = onTaskTerminal;
    slowPollRef.current = slowPollRefresh;
  }, [onTaskPatch, onTaskMissing, onTaskTerminal, slowPollRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const defaultTerminal = async (taskId: string) => {
      if (terminalFetchingRef.current.has(taskId)) return;
      terminalFetchingRef.current.add(taskId);
      try {
        const res = await getTask(taskId);
        const full = extractFullCgiTaskFromApiResponse(res.data) ?? extractCgiTaskFromApiResponse(res.data);
        if (full) onTaskPatchRef.current(full);
      } finally {
        terminalFetchingRef.current.delete(taskId);
      }
    };

    const unsub = subscribeTaskNotifications((msg) => {
      const patch = wsPayloadToWritingTaskItem(msg.task);
      if (!patch) return;

      invalidateTaskListCache();
      onTaskPatchRef.current(patch);

      if (patch.status === 'pending' && onTaskMissingRef.current) {
        onTaskMissingRef.current(patch.id);
      }

      if (isTerminalTaskStatus(patch.status)) {
        const handler = onTaskTerminalRef.current ?? defaultTerminal;
        void Promise.resolve(handler(patch.id, patch));
      }
    });

    let slowPollTimer: ReturnType<typeof setInterval> | null = null;
    if (slowPollRef.current) {
      slowPollTimer = setInterval(() => {
        try {
          slowPollRef.current?.();
        } catch {
          // ignore
        }
      }, slowPollMs);
    }

    return () => {
      unsub();
      if (slowPollTimer) clearInterval(slowPollTimer);
      terminalFetchingRef.current.clear();
    };
  }, [enabled, slowPollMs]);
}
