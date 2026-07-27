import { useEffect, useRef } from 'react';
import { getSmartflowTask, type SmartflowExecutionItem } from '../api/client';
import { subscribeTaskNotifications } from '../notifications/task-notifications';
import { isTerminalTaskStatus } from '../notifications/task-snapshot';
import {
  mergeSmartflowExecution,
  wsPayloadToSmartflowExecutionPatch,
} from '../notifications/smartflow-ws';

const DEFAULT_SLOW_POLL_MS = 120_000;

/**
 * Smartflow 执行列表 / 运行区：订阅 Gateway WS（mxmnotify task_updated 等），增量更新进度。
 */
export function useSmartflowExecutionSync(options: {
  enabled: boolean;
  /** 仅合并当前工作流下的执行（列表过滤） */
  smartflowId?: string | null;
  onPatch: (patch: Partial<SmartflowExecutionItem>) => void;
  /** 列表中尚无该执行时插入或拉全量 */
  onExecutionMissing?: (executionId: string) => void | Promise<void>;
  /** 终态后拉一次完整记录（flow_chain / output_data） */
  onExecutionTerminal?: (executionId: string) => void | Promise<void>;
  slowPollRefresh?: () => void;
  slowPollMs?: number;
}): void {
  const {
    enabled,
    smartflowId,
    onPatch,
    onExecutionMissing,
    onExecutionTerminal,
    slowPollRefresh,
    slowPollMs = DEFAULT_SLOW_POLL_MS,
  } = options;

  const smartflowIdRef = useRef(smartflowId);
  const onPatchRef = useRef(onPatch);
  const onMissingRef = useRef(onExecutionMissing);
  const onTerminalRef = useRef(onExecutionTerminal);
  const slowPollRef = useRef(slowPollRefresh);
  const terminalFetchingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    smartflowIdRef.current = smartflowId;
    onPatchRef.current = onPatch;
    onMissingRef.current = onExecutionMissing;
    onTerminalRef.current = onExecutionTerminal;
    slowPollRef.current = slowPollRefresh;
  }, [smartflowId, onPatch, onExecutionMissing, onExecutionTerminal, slowPollRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const matchesFlow = (patch: Partial<SmartflowExecutionItem>) => {
      const fid = smartflowIdRef.current;
      if (!fid) return true;
      return !patch.smartflow_id || patch.smartflow_id === fid;
    };

    const defaultTerminal = async (executionId: string) => {
      if (terminalFetchingRef.current.has(executionId)) return;
      terminalFetchingRef.current.add(executionId);
      try {
        const res = await getSmartflowTask(executionId);
        const body = res.data as { data?: SmartflowExecutionItem } | undefined;
        if (body?.data) onPatchRef.current(body.data);
      } finally {
        terminalFetchingRef.current.delete(executionId);
      }
    };

    const unsub = subscribeTaskNotifications((msg) => {
      const patch = wsPayloadToSmartflowExecutionPatch(msg.task);
      if (!patch?.id || !matchesFlow(patch)) return;

      onPatchRef.current(patch);

      if (patch.status === 'pending' && onMissingRef.current) {
        void Promise.resolve(onMissingRef.current(patch.id));
      }

      if (patch.status && isTerminalTaskStatus(patch.status)) {
        const handler = onTerminalRef.current ?? defaultTerminal;
        void Promise.resolve(handler(patch.id));
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
