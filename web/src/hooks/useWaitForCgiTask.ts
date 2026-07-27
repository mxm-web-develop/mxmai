import { getTask, type WritingTaskItem } from '../api/client';
import { subscribeTaskNotifications } from '../notifications/task-notifications';
import {
  extractCgiTaskFromApiResponse,
  isTerminalTaskStatus,
  wsPayloadToWritingTaskItem,
} from '../notifications/task-snapshot';

export interface WaitForCgiTaskOptions {
  timeoutMs?: number;
  onProgress?: (patch: WritingTaskItem, status: string) => void;
  /** 额外视为「可结束等待」的状态（如 awaiting_review） */
  stopOnStatuses?: string[];
}

/**
 * 等待单个 CGI 任务终态（WebSocket），完成后 getTask 一次取全量。
 * 可额外在 awaiting_review 等状态提前 resolve，便于闸门交互后续跑。
 */
export function waitForCgiTask(
  taskId: string,
  options: WaitForCgiTaskOptions = {}
): Promise<{ task: WritingTaskItem | null; timedOut: boolean }> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const stopOn = new Set(options.stopOnStatuses ?? []);

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = async (timedOut: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsub();
      const res = await getTask(taskId);
      const full = extractCgiTaskFromApiResponse(res.data);
      resolve({ task: full, timedOut });
    };

    const shouldStop = (status: string) =>
      isTerminalTaskStatus(status) || stopOn.has(status);

    const unsub = subscribeTaskNotifications((msg) => {
      const task = msg.task;
      if (task.id !== taskId) return;
      const patch = wsPayloadToWritingTaskItem(task);
      if (!patch) return;
      options.onProgress?.(patch, patch.status);
      if (shouldStop(patch.status)) {
        void finish(false);
      }
    });

    // 任务可能已在目标态（竞态：WS 早于订阅）
    void getTask(taskId).then((res) => {
      if (settled) return;
      const full = extractCgiTaskFromApiResponse(res.data);
      if (full?.status && shouldStop(full.status)) {
        options.onProgress?.(full, full.status);
        void finish(false);
      }
    });

    timer = setTimeout(() => {
      void finish(true);
    }, timeoutMs);
  });
}
