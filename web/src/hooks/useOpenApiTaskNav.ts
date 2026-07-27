import { useEffect, useRef } from 'react';
import { consumeOpenApiTaskNav, type OpenApiNavPageId } from '../lib/openApiTaskNavigation';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';

type TaskWithId = { id: string };

/**
 * 从开放 API 统计页跳转后：切到「第三方应用」分栏并在任务列表加载完成后打开对应任务。
 */
export function useOpenApiTaskNav<T extends TaskWithId>(options: {
  page: OpenApiNavPageId;
  isLoggedIn: boolean;
  tasks: T[];
  loadingTasks: boolean;
  setCreationSourceTab: (tab: TaskCreationSourceTab) => void;
  onOpenTask: (task: T) => void | Promise<void>;
}): void {
  const pendingTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nav = consumeOpenApiTaskNav();
    if (!nav || nav.page !== options.page) return;
    options.setCreationSourceTab('open_api');
    pendingTaskIdRef.current = nav.taskId;
  }, [options.page, options.setCreationSourceTab]);

  useEffect(() => {
    const taskId = pendingTaskIdRef.current;
    if (!taskId || !options.isLoggedIn || options.loadingTasks) return;
    const task = options.tasks.find((t) => t.id === taskId);
    if (!task) return;
    pendingTaskIdRef.current = null;
    void options.onOpenTask(task);
  }, [options.isLoggedIn, options.loadingTasks, options.tasks, options.onOpenTask]);
}
