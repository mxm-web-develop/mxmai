/**
 * Worker 内网：Go control / taskd 触发 executeTask
 */
import { Router, type Request, type Response } from 'express';
import { taskExecutor } from '../task/task-executor';
import { buildExecuteOptionsFromTask } from '../task/build-execute-params';

function internalToken(): string | null {
  const t = String(process.env.MXMCGI_INTERNAL_TOKEN || '').trim();
  return t || null;
}

function isAuthorized(req: Request): boolean {
  const expected = internalToken();
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return auth.slice(7).trim() === expected;
}

export function createInternalTasksRouter(): Router {
  const router = Router();

  router.post('/internal/tasks/:id/execute', async (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid internal token' },
      });
      return;
    }

    const taskId = String(req.params.id || '').trim();
    if (!taskId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TASK_ID', message: 'Missing task id' },
      });
      return;
    }

    try {
      const taskManager = taskExecutor.getTaskManager();
      const { task } = await taskManager.getTask(taskId);
      if (!task) {
        res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: `Task ${taskId} not found` },
        });
        return;
      }

      if (task.status === 'processing' || task.status === 'queued') {
        const progress = task.progress?.progress ?? 0;
        const claimedOnly =
          task.status === 'processing' &&
          progress === 0 &&
          !task.progress?.startedAt;
        if (!claimedOnly) {
          const workerIdMeta = task.metadata?.workerId;
          res.status(409).json({
            success: false,
            error: {
              code: 'TASK_ALREADY_RUNNING',
              message: `Task ${taskId} is already ${task.status}`,
              workerId: typeof workerIdMeta === 'string' ? workerIdMeta : undefined,
            },
          });
          return;
        }
      }

      if (task.status === 'completed' || task.status === 'cancelled') {
        res.status(409).json({
          success: false,
          error: {
            code: 'TASK_NOT_EXECUTABLE',
            message: `Task ${taskId} status is ${task.status}`,
          },
        });
        return;
      }

      const opts = buildExecuteOptionsFromTask(task);
      if (!opts) {
        res.status(422).json({
          success: false,
          error: {
            code: 'CANNOT_BUILD_EXECUTE_OPTIONS',
            message: `Cannot build execute options for task ${taskId} (type=${task.type})`,
          },
        });
        return;
      }

      void taskExecutor.executeTask(opts).catch((e) => {
        console.error(`[InternalTasks] executeTask failed for ${taskId}:`, e);
      });

      res.status(202).json({
        success: true,
        taskId,
        status: 'accepted',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  });

  return router;
}
