/**
 * 任务恢复服务
 * 处理服务器重启或网络问题导致的任务卡住问题
 */

import { taskManager } from './task-manager';
import { taskExecutor } from './task-executor';
import type { Task, TaskStatus } from './types';
import {
  BATCH_PARENT_TASK_TYPES,
  getChildTaskIdsFromBatchParent,
  summarizeBatchChildStatuses,
  tryCompleteBatchParentIfChildrenTerminal,
} from './batch-parent-aggregate';

export interface TaskRecoveryConfig {
  /**
   * 任务超时时间（毫秒）
   * 默认：30 分钟（图片生成）或 10 分钟（文本生成）
   */
  timeoutMs?: number;
  
  /**
   * 检查间隔（毫秒）
   * 默认：5 分钟
   */
  checkIntervalMs?: number;
  
  /**
   * 是否在启动时自动恢复卡住的任务
   * 默认：true
   */
  autoRecoverOnStartup?: boolean;
  
  /**
   * 是否自动重试失败的任务
   * 默认：false（只标记为失败）
   */
  autoRetry?: boolean;
}

/**
 * 任务恢复服务
 */
export class TaskRecoveryService {
  private config: Required<TaskRecoveryConfig>;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: TaskRecoveryConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs || 30 * 60 * 1000, // 默认 30 分钟
      checkIntervalMs: config.checkIntervalMs || 5 * 60 * 1000, // 默认 5 分钟
      autoRecoverOnStartup: config.autoRecoverOnStartup !== false,
      autoRetry: config.autoRetry || false,
    };
  }

  /**
   * 启动恢复服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[TaskRecovery] 恢复服务已在运行');
      return;
    }

    this.isRunning = true;
    console.log('[TaskRecovery] 启动任务恢复服务...');

    // 启动时恢复卡住的任务（如果失败，不阻止服务启动）
    if (this.config.autoRecoverOnStartup) {
      try {
      await this.recoverStuckTasksOnStartup();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // 检查是否是 Supabase 连接错误
        if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('QUERY_ERROR')) {
          console.warn('[TaskRecovery] ⚠️  启动时恢复失败：Supabase 连接不可用');
          console.warn('[TaskRecovery] ⚠️  提示：请检查 SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量是否正确');
          console.warn('[TaskRecovery] ⚠️  恢复服务将继续运行，但启动时恢复功能暂时不可用');
        } else {
          console.error('[TaskRecovery] ⚠️  启动时恢复失败:', errorMessage);
        }
        // 不阻止服务启动，允许定期检查继续运行
      }
    }

    // 定期检查超时任务 + 复查「视频生成超时」的失败任务（可能后台已成功）
    this.checkInterval = setInterval(() => {
      this.checkAndRecoverStuckTasks()
        .then(() => this.checkAndRecoverVideoTimeoutFailedTasks())
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // 如果是连接错误，只记录一次警告，避免日志刷屏
          if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
            // 静默处理连接错误，避免日志过多
            // console.warn('[TaskRecovery] 检查超时任务失败：Supabase 连接不可用');
          } else {
            console.error('[TaskRecovery] 检查超时任务失败:', errorMessage);
          }
        });
    }, this.config.checkIntervalMs);

    console.log(`[TaskRecovery] 恢复服务已启动，检查间隔: ${this.config.checkIntervalMs / 1000}秒`);
  }

  /**
   * 停止恢复服务
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[TaskRecovery] 恢复服务已停止');
  }

  /**
   * 启动时恢复卡住的任务
   */
  private async recoverStuckTasksOnStartup(): Promise<void> {
    try {
      console.log('[TaskRecovery] 检查启动时卡住的任务...');
      
      // 查找所有 processing 状态的任务
      const stuckTasks = await taskManager.listTasks({
        status: 'processing',
        limit: 1000, // 限制数量，避免一次性处理太多
      });

      if (stuckTasks.tasks.length === 0) {
        console.log('[TaskRecovery] 没有发现卡住的任务');
        return;
      }

      console.log(`[TaskRecovery] 发现 ${stuckTasks.tasks.length} 个 processing 状态的任务，开始恢复...`);

      const now = Date.now();
      for (const task of stuckTasks.tasks) {
        if (this.isOrphanedGraphTask(task, now)) {
          console.log(
            `[TaskRecovery] Graph 任务 ${task.id} 长时间无进展（progress=${task.progress?.progress ?? 0}%），重置为 pending 供 worker 重试`
          );
          await taskManager.updateTaskStatus(task.id, 'pending', {
            progress: 0,
            error: undefined,
          });
          continue;
        }

        // 检查任务是否真的卡住了（通过 updated_at 判断）
        const lastUpdateTime = task.updatedAt.getTime();
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // 根据任务类型设置检查间隔
        let checkInterval: number;
        if (task.type === 'video') {
          checkInterval = 10 * 60 * 1000; // 视频任务 10 分钟
        } else if (task.type === 'writing' || task.type === 'text') {
          checkInterval = 2 * 60 * 1000; // 写作和文本任务 2 分钟（通常较快）
        } else {
          checkInterval = 5 * 60 * 1000; // 其他任务 5 分钟
        }
        
        if (timeSinceLastUpdate < checkInterval) {
          console.log(`[TaskRecovery] 任务 ${task.id} 最近有更新（${Math.round(timeSinceLastUpdate / 1000)}秒前），跳过恢复`);
          continue;
        }

        // 启动恢复不应仅凭“最近未更新”就直接判定失败；
        // 需要同时满足“运行时间超过阈值”，避免服务重启时误杀仍在执行中的任务。
        const taskStartTime = task.createdAt.getTime();
        const taskDuration = now - taskStartTime;
        const taskTimeout = this.getTaskTimeout(task.type, this.config.timeoutMs);
        if (taskDuration <= taskTimeout) {
          console.log(
            `[TaskRecovery] 任务 ${task.id} 虽然最近未更新（${Math.round(timeSinceLastUpdate / 1000)}秒前），但运行时间未超过阈值（${Math.round(taskDuration / 1000)}秒 <= ${Math.round(taskTimeout / 1000)}秒），跳过恢复`
          );
          continue;
        }
        
        await this.handleStuckTask(task);
      }

      console.log('[TaskRecovery] 启动时恢复完成');
    } catch (error) {
      console.error('[TaskRecovery] 启动时恢复失败:', error);
    }
  }

  /**
   * 定期检查并恢复超时任务
   */
  private async checkAndRecoverStuckTasks(): Promise<void> {
    try {
      // 只检查最近 24 小时内创建的任务，避免检查到旧任务
      // 旧任务可能是历史遗留数据，不应该被任务恢复服务处理
      const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 小时前
      
      // 只检查 processing 状态的任务（包括可能卡住的任务）
      // 不再对 failed / network_error 等终态任务做自动恢复，避免状态被“偷偷改写”
      const processingTasks = await taskManager.listTasks({
        status: 'processing',
        limit: 1000,
        startDate: recentDate, // 只查询最近 24 小时的任务
      });

      const allTasksToCheck = processingTasks;

      if (allTasksToCheck.tasks.length === 0) {
        return;
      }

      const now = Date.now();
      const timeoutMs = this.config.timeoutMs;
      let recoveredCount = 0;

      for (const task of allTasksToCheck.tasks) {
        if (this.isOrphanedGraphTask(task, now)) {
          console.log(
            `[TaskRecovery] Graph 任务 ${task.id} 长时间无进展（progress=${task.progress?.progress ?? 0}%），重置为 pending`
          );
          await taskManager.updateTaskStatus(task.id, 'pending', {
            progress: 0,
            error: undefined,
          });
          recoveredCount++;
          continue;
        }

        // 关键修复：如果任务的 createdAt 明显是旧数据（超过 24 小时），直接跳过
        // 这可能是历史遗留数据，不应该被任务恢复服务处理
        const createdAtTime = task.createdAt.getTime();
        const taskAge = now - createdAtTime;
        const maxTaskAge = 24 * 60 * 60 * 1000; // 24 小时
        
        if (taskAge > maxTaskAge) {
          // 任务创建时间超过 24 小时，可能是旧数据，跳过检查
          console.log(
            `[TaskRecovery] 跳过旧任务 ${task.id}：创建时间 ${task.createdAt.toISOString()}，距今 ${Math.round(taskAge / 1000 / 60 / 60)} 小时，超过 24 小时阈值`
          );
          continue;
        }
        
        // 首先检查任务是否真的卡住了（通过 updated_at 判断）
        // 如果最近有更新，说明任务还在正常进行，跳过检查
        const lastUpdateTime = task.updatedAt.getTime();
        
        // 如果 updatedAt 早于 createdAt，说明 updatedAt 是旧数据（可能是数据库中的旧记录）
        // 使用 createdAt 来计算 timeSinceLastUpdate，确保准确性
        const effectiveLastUpdateTime = lastUpdateTime < createdAtTime ? createdAtTime : lastUpdateTime;
        const timeSinceLastUpdate = now - effectiveLastUpdateTime;
        
        // 如果 updatedAt 早于 createdAt，记录警告
        if (lastUpdateTime < createdAtTime) {
          console.warn(
            `[TaskRecovery] 任务 ${task.id} 的 updatedAt (${task.updatedAt.toISOString()}) 早于 createdAt (${task.createdAt.toISOString()})，可能是旧数据。使用 createdAt 计算 timeSinceLastUpdate。`
          );
        }
        
        if (BATCH_PARENT_TASK_TYPES.has(task.type)) {
          const childTaskIds = getChildTaskIdsFromBatchParent(task);
          if (childTaskIds.length > 0) {
            console.log(
              `[TaskRecovery] 检测到批量父任务 (${task.id}, ${task.type})，检查 ${childTaskIds.length} 个子任务状态...`
            );
            const { completedCount, failedCount, processingCount } = await summarizeBatchChildStatuses(
              taskManager,
              childTaskIds
            );
            console.log(
              `[TaskRecovery] 子任务状态统计: 完成 ${completedCount}, 失败 ${failedCount}, 处理中 ${processingCount}, 总计 ${childTaskIds.length}`
            );
            const done = await tryCompleteBatchParentIfChildrenTerminal(taskManager, task, childTaskIds);
            if (done) {
              recoveredCount++;
              continue;
            }
            if (processingCount > 0) {
              console.log(`[TaskRecovery] 还有 ${processingCount} 个子任务在处理中，继续等待父任务 ${task.id}`);
              continue;
            }
          }
        }
        
        // 根据任务类型设置检查间隔
        // 注意：graph 任务（图片生成）可能需要较长时间，特别是使用外部 API 时
        // 如果任务状态是 processing 且最近没有更新，但运行时间不长，可能是正在生成中
        let checkInterval: number;
        if (task.type === 'video') {
          checkInterval = 10 * 60 * 1000; // 视频任务 10 分钟
        } else if (task.type === 'writing' || task.type === 'text') {
          checkInterval = 2 * 60 * 1000; // 写作和文本任务 2 分钟（通常较快）
        } else if (task.type === 'graph') {
          const taskStartTime = task.createdAt.getTime();
          const taskDuration = now - taskStartTime;
          if (taskDuration < 30 * 60 * 1000) {
            console.log(
              `[TaskRecovery] Graph 任务 ${task.id} 运行时间 ${Math.round(taskDuration / 1000 / 60)}分钟，未超过 30 分钟，继续等待（可能正在生成中）`
            );
            continue;
          }
          checkInterval = 15 * 60 * 1000;
        } else {
          checkInterval = 5 * 60 * 1000; // 其他任务 5 分钟
        }
        
        if (timeSinceLastUpdate < checkInterval) {
          // 最近有更新，任务还在正常进行，跳过
          continue;
        }

        // 对于视频任务，特别是使用 DeerAPI 的任务，先检查实际状态
        // 判断是否为 DeerAPI 任务：provider === 'deer' 或 model 是 sora/runway 相关
        const model = task.metadata?.model || '';
        const provider = task.metadata?.provider || 'unknown';
        const isDeerAPITask = 
          task.type === 'video' && (
            provider === 'deer' || 
            /^sora-2/.test(model) || 
            /^sora/.test(model) || 
            model.includes('runway') || 
            model.includes('gen3') || 
            model.includes('gen4')
          );
        
        // 如果是 DeerAPI 任务，先查询实际状态，避免误判超时
        if (isDeerAPITask) {
          console.log(`[TaskRecovery] 检测到 DeerAPI 视频任务 (model: ${model}, provider: ${provider})，先查询实际状态...`);
          const checkResult = await this.checkAndRecoverDeerAPITask(task);
          if (checkResult === 'completed') {
            // 任务已成功恢复为完成状态
            console.log(`[TaskRecovery] 任务 ${task.id} 已成功恢复为完成状态`);
            recoveredCount++;
            continue;
          } else if (checkResult === 'failed') {
            // 任务已标记为失败
            console.log(`[TaskRecovery] 任务 ${task.id} 已标记为失败`);
            recoveredCount++;
            continue;
          } else if (checkResult === 'processing' || checkResult === 'queued') {
            // 任务仍在处理中，继续等待，不标记为失败
            console.log(`[TaskRecovery] 任务 ${task.id} 在 DeerAPI 中状态为 ${checkResult}，继续等待`);
            continue;
          }
          // 如果查询失败，继续使用超时逻辑
          console.log(`[TaskRecovery] 无法查询任务 ${task.id} 在 DeerAPI 中的状态，使用超时逻辑`);
        }

        // 计算任务运行时间
        // 优先使用 progress.startedAt（代表真正开始处理的时间），没有则回退到 createdAt
        // 这样“运行时间”更贴近你看到的实际执行时长
        let taskStartTime = task.progress.startedAt?.getTime();
        if (!taskStartTime || Number.isNaN(taskStartTime)) {
          taskStartTime = task.createdAt.getTime();
        }
        const taskDuration = now - taskStartTime;

        // 根据任务类型确定超时时间
        const taskTimeout = this.getTaskTimeout(task.type, timeoutMs);

        // 只有当任务运行时间超过阈值，并且最近没有更新时，才认为任务超时
        if (taskDuration > taskTimeout) {
          console.warn(
            `[TaskRecovery] 发现超时任务: ${task.id}, 类型: ${task.type}, 运行时间: ${Math.round(taskDuration / 1000)}秒 (${Math.round(taskDuration / 1000 / 60)}分钟), 超时阈值: ${Math.round(taskTimeout / 1000)}秒 (${Math.round(taskTimeout / 1000 / 60)}分钟), 最后更新: ${Math.round(timeSinceLastUpdate / 1000)}秒前`
          );
          await this.handleStuckTask(task);
          recoveredCount++;
        }
      }

      if (recoveredCount > 0) {
        console.log(`[TaskRecovery] 本次检查恢复了 ${recoveredCount} 个超时任务`);
      }
    } catch (error) {
      console.error('[TaskRecovery] 检查超时任务失败:', error);
    }
  }

  /**
   * 复查「视频生成超时」的失败任务
   *
   * 说明：
   * - 历史版本中这里会针对视频任务再次向 DeerAPI 查询实际状态，
   *   避免“标记为超时失败，但上游实际上已成功”的情况。
   * - 当前版本已在 `checkAndRecoverStuckTasks` / `handleStuckTask` 中
   *   内联了 DeerAPI 状态检查与恢复逻辑，这里暂时不做任何额外操作。
   *
   * 为保持向后兼容（避免 `this.checkAndRecoverVideoTimeoutFailedTasks is not a function`
   * 的运行时错误），保留一个空实现。后续如需更细粒度的视频恢复逻辑，
   * 可在此方法内补充。
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private async checkAndRecoverVideoTimeoutFailedTasks(): Promise<void> {}

  /**
   * 处理卡住的任务
   */
  private async handleStuckTask(task: Task): Promise<void> {
    try {
      // 检查任务是否真的卡住了（通过 updated_at 判断）
      const now = Date.now();
      const lastUpdateTime = task.updatedAt.getTime();
      const createdAtTime = task.createdAt.getTime();
      
      // 如果 updatedAt 早于 createdAt，说明 updatedAt 是旧数据（可能是数据库中的旧记录）
      // 使用 createdAt 来计算 timeSinceLastUpdate，确保准确性
      const effectiveLastUpdateTime = lastUpdateTime < createdAtTime ? createdAtTime : lastUpdateTime;
      const timeSinceLastUpdate = now - effectiveLastUpdateTime;
      
      // 如果 updatedAt 早于 createdAt，记录警告
      if (lastUpdateTime < createdAtTime) {
        console.warn(
          `[TaskRecovery] 任务 ${task.id} 的 updatedAt (${task.updatedAt.toISOString()}) 早于 createdAt (${task.createdAt.toISOString()})，可能是旧数据。使用 createdAt 计算 timeSinceLastUpdate。`
        );
      }
      // 计算任务运行时间：
      // - 优先使用 progress.startedAt（代表真正开始处理的时间）
      // - 若不存在或无效，则回退到 createdAt
      // 所有时间都使用 UTC 时间戳（毫秒），确保时区一致性
      let taskStartTime = task.progress.startedAt?.getTime();
      if (!taskStartTime || Number.isNaN(taskStartTime)) {
        taskStartTime = task.createdAt.getTime();
      }
      const taskDuration = now - taskStartTime;
      
      // 验证时间合理性：如果 startedAt 存在且与 createdAt 差异过大，记录警告
      if (task.progress.startedAt) {
        const startedAtTime = task.progress.startedAt.getTime();
        const startedAtDiff = Math.abs(startedAtTime - task.createdAt.getTime());
        if (startedAtDiff > 60 * 60 * 1000) { // 超过1小时差异
          console.warn(
            `[TaskRecovery] 任务 ${task.id} 的 startedAt (${task.progress.startedAt.toISOString()}) 与 createdAt (${task.createdAt.toISOString()}) 差异 ${Math.round(startedAtDiff / 1000 / 60)} 分钟，请确认任务创建时间是否异常。`
          );
        }
      }

      // 根据任务类型设置检查间隔
      let checkInterval: number;
      if (task.type === 'video') {
        checkInterval = 10 * 60 * 1000; // 视频任务 10 分钟
      } else if (task.type === 'writing' || task.type === 'text') {
        checkInterval = 2 * 60 * 1000; // 写作和文本任务 2 分钟（通常较快）
      } else {
        checkInterval = 5 * 60 * 1000; // 其他任务 5 分钟
      }
      
      if (timeSinceLastUpdate < checkInterval) {
        console.log(`[TaskRecovery] 任务 ${task.id} 最近有更新（${Math.round(timeSinceLastUpdate / 1000)}秒前），跳过恢复`);
        return;
      }

      console.log(`[TaskRecovery] 处理卡住的任务: ${task.id}, 最后更新: ${Math.round(timeSinceLastUpdate / 1000)}秒前`);

      if (BATCH_PARENT_TASK_TYPES.has(task.type)) {
        const childTaskIds = getChildTaskIdsFromBatchParent(task);
        if (childTaskIds.length > 0) {
          const { completedCount, failedCount, processingCount } = await summarizeBatchChildStatuses(
            taskManager,
            childTaskIds
          );
          const done = await tryCompleteBatchParentIfChildrenTerminal(taskManager, task, childTaskIds);
          if (done) {
            console.log(
              `[TaskRecovery] 父任务 ${task.id} 已更新为 completed（子任务: ${completedCount} 完成, ${failedCount} 失败）`
            );
            return;
          }
          if (processingCount > 0) {
            console.log(`[TaskRecovery] 父任务 ${task.id} 还有 ${processingCount} 个子任务在处理中，跳过`);
            return;
          }
        }
      }

      if (await this.tryRecoverStuckVideoPipelineRender(task)) {
        return;
      }

      // 对于视频任务，特别是使用 DeerAPI 的任务，先检查实际状态
      // 判断是否为 DeerAPI 任务：provider === 'deer' 或 model 是 sora/runway 相关
      const model = task.metadata?.model || '';
      const provider = task.metadata?.provider || 'unknown';
      const isDeerAPITask = 
        task.type === 'video' && (
          provider === 'deer' || 
          /^sora-2/.test(model) || 
          /^sora/.test(model) || 
          model.includes('runway') || 
          model.includes('gen3') || 
          model.includes('gen4')
        );
      
      if (isDeerAPITask) {
        console.log(`[TaskRecovery] 检测到 DeerAPI 视频任务 (model: ${model}, provider: ${provider})，查询实际状态...`);
        const checkResult = await this.checkAndRecoverDeerAPITask(task);
        if (checkResult === 'completed') {
          // 任务已成功恢复为完成状态
          console.log(`[TaskRecovery] 任务 ${task.id} 已成功恢复为完成状态`);
          return;
        } else if (checkResult === 'failed') {
          // 任务已标记为失败
          console.log(`[TaskRecovery] 任务 ${task.id} 已标记为失败`);
          return;
        } else if (checkResult === 'processing' || checkResult === 'queued') {
          // 任务仍在处理中，继续等待，不标记为失败
          console.log(`[TaskRecovery] 任务 ${task.id} 在 DeerAPI 中状态为 ${checkResult}，继续等待`);
          return;
        }
        // 如果查询失败，继续使用超时逻辑
        console.log(`[TaskRecovery] 无法查询任务 ${task.id} 在 DeerAPI 中的状态，使用超时逻辑`);
      }

      if (this.config.autoRetry) {
        // 自动重试：重新执行任务
        console.log(`[TaskRecovery] 尝试重新执行任务: ${task.id}`);
        await this.retryTask(task);
      } else {
        // 生成更详细的错误信息
        const taskDurationMinutes = Math.round(taskDuration / 1000 / 60);
        const timeoutMinutes = Math.round(this.getTaskTimeout(task.type, this.config.timeoutMs) / 1000 / 60);
        const lastUpdateMinutes = Math.round(timeSinceLastUpdate / 1000 / 60);
        
        // 文案说明这里的“运行时间”是「自 startedAt / createdAt 以来已过去的时间」
        let errorMessage = `任务超时：任务自开始已存在 ${taskDurationMinutes} 分钟，超过阈值 ${timeoutMinutes} 分钟。`;
        if (lastUpdateMinutes > 5) {
          errorMessage += ` 最后更新于 ${lastUpdateMinutes} 分钟前，可能因服务器重启或网络中断导致任务中断。`;
        } else {
          errorMessage += ` 可能是生成服务响应缓慢或任务队列拥堵。`;
        }
        
        // 添加任务类型和模型信息
        if (task.metadata?.model) {
          errorMessage += ` 模型: ${task.metadata.model}`;
        }
        if (task.metadata?.provider) {
          errorMessage += `, 提供商: ${task.metadata.provider}`;
        }
        
        // 使用「开始时间 + 超时阈值」作为 completedAt，避免因次日才被恢复导致显示时间差数十小时
        const startTime = task.progress.startedAt?.getTime() ?? task.createdAt.getTime();
        const timeoutMs = this.getTaskTimeout(task.type, this.config.timeoutMs);
        const completedAt = new Date(Math.min(Date.now(), startTime + timeoutMs));
        await taskManager.setTaskError(task.id, errorMessage, { completedAt });
        console.log(`[TaskRecovery] 任务 ${task.id} 已标记为失败`);
      }
    } catch (error) {
      console.error(`[TaskRecovery] 处理卡住的任务失败 (${task.id}):`, error);
      // 即使处理失败，也尝试标记为失败
      try {
        await taskManager.setTaskError(
          task.id,
          `任务恢复失败: ${error instanceof Error ? error.message : String(error)}`
        );
      } catch (e) {
        console.error(`[TaskRecovery] 标记任务失败也失败 (${task.id}):`, e);
      }
    }
  }

  /**
   * 检查并恢复 DeerAPI 任务的实际状态
   * 如果任务已完成，更新任务状态和结果
   * 返回实际状态，如果无法查询则返回 null
   */
  private async checkAndRecoverDeerAPITask(task: Task): Promise<'completed' | 'failed' | 'processing' | 'queued' | null> {
    try {
      // 重新从数据库获取最新任务数据，确保 metadata 是最新的
      const latestTaskResponse = await taskManager.getTask(task.id);
      const latestTask = latestTaskResponse?.task;
      if (!latestTask) {
        console.warn(`[TaskRecovery] 任务 ${task.id} 不存在，无法查询 DeerAPI 状态`);
        return null;
      }
      
      // 从最新任务的 metadata 中获取 taskId（可能是 Runway taskId 或 Sora videoId）
      // 注意：Sora 任务的 videoId 保存在 metadata.taskId 中
      const taskId = latestTask.metadata?.taskId || latestTask.metadata?.videoId || latestTask.metadata?.runwayTaskId;
      if (!taskId) {
        console.log(`[TaskRecovery] 任务 ${task.id} 没有 taskId，无法查询 DeerAPI 状态`);
        console.log(`[TaskRecovery] 任务 metadata:`, JSON.stringify(latestTask.metadata, null, 2));
        return null;
      }
      
      console.log(`[TaskRecovery] ✅ 找到 taskId: ${taskId}，开始查询 DeerAPI 状态`);

      // 判断是 Runway 还是 Sora 任务
      const model = task.metadata?.model || '';
      const isRunway = model.includes('runway') || model.includes('gen3') || model.includes('gen4');
      
      if (isRunway) {
        // Runway 任务：使用 getRunwayTaskStatus
        const { DeerAPIClient } = await import('../utils/deerapi-client');
        // 使用 fromEnv，确保 baseUrl/apiKey 正确加载
        const client = DeerAPIClient.fromEnv();
        const status = await client.getRunwayTaskStatus(taskId);
        
        if (status.status === 'SUCCEEDED') {
          // 任务已完成，更新任务状态和结果
          console.log(`[TaskRecovery] 任务 ${task.id} 在 Runway 中已完成，更新任务状态`);
          await this.recoverCompletedRunwayTask(task, status);
          return 'completed';
        } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
          return 'failed';
        } else if (status.status === 'RUNNING') {
          return 'processing';
        } else if (status.status === 'PENDING') {
          return 'queued';
        }
        return null;
      } else {
        // Sora 任务：使用 getVideoStatusUnified
        // 直接使用 DeerAPIClient.fromEnv()，不依赖 provider 实例
        const { DeerAPIClient } = await import('../utils/deerapi-client');
        const client = DeerAPIClient.fromEnv();
        
        console.log(`[TaskRecovery] 查询 Sora 任务状态: taskId=${taskId}, model=${model}`);
        const status = await client.getVideoStatusUnified(taskId);
        
        console.log(`[TaskRecovery] Sora 任务状态查询结果: status=${status.status}, progress=${status.progress}, video_url=${status.video_url ? '存在' : '不存在'}`);
        
        if (status.status === 'completed') {
          // 任务已完成，更新任务状态和结果
          console.log(`[TaskRecovery] ✅ 任务 ${task.id} 在 Sora 中已完成，更新任务状态`);
          // 使用最新任务数据恢复
          await this.recoverCompletedSoraTask(latestTask, status);
          return 'completed';
        } else if (status.status === 'failed') {
          console.log(`[TaskRecovery] 任务 ${task.id} 在 Sora 中已失败`);
          return 'failed';
        } else if (status.status === 'in_progress') {
          console.log(`[TaskRecovery] 任务 ${task.id} 在 Sora 中处理中`);
          return 'processing';
        } else if (status.status === 'queued') {
          console.log(`[TaskRecovery] 任务 ${task.id} 在 Sora 中排队中`);
          return 'queued';
        }
        console.warn(`[TaskRecovery] 任务 ${task.id} 状态未知: ${status.status}`);
        return null;
      }
    } catch (error) {
      console.error(`[TaskRecovery] 查询 DeerAPI 任务状态失败 (${task.id}):`, error);
      if (error instanceof Error) {
        console.error(`[TaskRecovery] 错误详情:`, error.message, error.stack);

        const msg = error.message || '';
        const isNetworkError =
          msg.includes('fetch failed') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('ENOTFOUND') ||
          msg.includes('timeout') ||
          msg.includes('502') ||
          msg.includes('503') ||
          msg.includes('504');

        // 查询 Deer 状态时的网络/5xx 错误：标记为 network_error，交由用户手动处理
        if (isNetworkError) {
          try {
            await taskManager.updateTaskStatus(task.id, 'network_error', {
              error: `查询 DeerAPI 状态失败（网络错误或上游不可用）：${msg}`,
            });
            console.warn(
              `[TaskRecovery] 已将任务 ${task.id} 标记为 network_error，后续不会自动恢复，请手动检查或重试`
            );
          } catch (updateError) {
            console.error(
              `[TaskRecovery] 将任务 ${task.id} 标记为 network_error 失败:`,
              updateError
            );
          }
        }
      }
      return null;
    }
  }

  /**
   * 恢复已完成的 Runway 任务
   */
  private async recoverCompletedRunwayTask(
    task: Task,
    runwayStatus: {
      id: string;
      status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
      output?: string | string[];
      error?: { code?: string; message?: string };
    }
  ): Promise<void> {
    try {
      // 提取视频 URL
      let videoUrl: string | undefined;
      if (runwayStatus.output) {
        if (Array.isArray(runwayStatus.output) && runwayStatus.output.length > 0) {
          videoUrl = runwayStatus.output[0];
        } else if (typeof runwayStatus.output === 'string') {
          videoUrl = runwayStatus.output;
        }
      }

      if (!videoUrl) {
        console.warn(`[TaskRecovery] 任务 ${task.id} 已完成但没有视频 URL`);
        await taskManager.setTaskError(task.id, '任务已完成但未返回视频 URL');
        return;
      }

      // 如果启用了 storeToMinio，下载并上传到 MinIO
      const storeToMinio = task.metadata?.storeToMinio;
      const storageConfig = task.metadata?.storageConfig;
      let mediaUrls = [videoUrl];
      let storageInfo: { keys: string[]; bucket: string; urls: string[] } | undefined;

      if (storeToMinio && storageConfig) {
        try {
          // 使用 storeFromGenerateResult 下载视频并上传到 MinIO
          const { storeFromGenerateResult } = await import('../utils/data-store');
          const storageResults = await storeFromGenerateResult(
            { mediaUrls: [videoUrl] },
            storageConfig,
            task.metadata?.userId,
            task.metadata?.model
          );
          
          if (storageResults.length > 0) {
            mediaUrls = [storageResults[0].url];
            storageInfo = {
              keys: storageResults.map(r => r.key),
              bucket: storageResults[0].bucket,
              urls: storageResults.map(r => r.url),
            };
            console.log(`[TaskRecovery] 任务 ${task.id} 的视频已上传到 MinIO: ${storageResults[0].url}`);
          }
        } catch (error) {
          console.error(`[TaskRecovery] 下载并上传视频失败:`, error);
          // 即使上传失败，也使用原始 URL
        }
      }

      // 更新任务状态为完成
      await taskManager.setTaskResult(task.id, {
        mediaUrls,
        storageInfo,
        metadata: {
          ...task.metadata,
          taskId: runwayStatus.id,
          runwayTaskId: runwayStatus.id,
          videoUrl,
        },
      });

      console.log(`[TaskRecovery] ✅ 任务 ${task.id} 已成功恢复为完成状态`);
    } catch (error) {
      console.error(`[TaskRecovery] 恢复 Runway 任务失败 (${task.id}):`, error);
      throw error;
    }
  }

  /**
   * 恢复已完成的 Sora 任务
   */
  private async recoverCompletedSoraTask(
    task: Task,
    soraStatus: {
      status: 'queued' | 'in_progress' | 'completed' | 'failed';
      video_url?: string;
      progress?: number;
      error?: any;
    }
  ): Promise<void> {
    try {
      let videoUrl = soraStatus.video_url;
      // 如果状态里没有带 video_url，尝试通过 DeerAPI /content 接口再取一次
      if (!videoUrl) {
        try {
          const { DeerAPIClient } = await import('../utils/deerapi-client');
          const client = DeerAPIClient.fromEnv();
          const deerVideoId = (task.metadata?.taskId || task.metadata?.videoId) as string | undefined;
          if (deerVideoId) {
            const content = await client.getVideoContent(deerVideoId);
            if (content && typeof content.video_url === 'string' && content.video_url.length > 0) {
              videoUrl = content.video_url;
              console.log(`[TaskRecovery] 任务 ${task.id} 通过 /content 接口获取到视频 URL`);
            }
          }
        } catch (e) {
          console.warn(`[TaskRecovery] 通过 DeerAPI /content 获取视频 URL 失败 (${task.id}):`, e);
        }
      }

      if (!videoUrl) {
        console.warn(`[TaskRecovery] 任务 ${task.id} 已完成但没有视频 URL`);
        await taskManager.setTaskError(task.id, '任务已完成但未返回视频 URL');
        return;
      }

      // 如果启用了 storeToMinio，下载并上传到 MinIO
      const storeToMinio = task.metadata?.storeToMinio;
      const storageConfig = task.metadata?.storageConfig;
      let mediaUrls = [videoUrl];
      let storageInfo: { keys: string[]; bucket: string; urls: string[] } | undefined;

      if (storeToMinio && storageConfig) {
        try {
          const { storeFromGenerateResult } = await import('./data-store');
          const storageResults = await storeFromGenerateResult(
            { mediaUrls: [videoUrl], metadata: task.metadata ?? {} },
            storageConfig,
            task.metadata?.userId as string | undefined,
            String(task.metadata?.model || 'unknown'),
          );
          mediaUrls = storageResults.map((r) => r.url);
          storageInfo = {
            keys: storageResults.map((r) => r.key),
            bucket: storageResults[0].bucket,
            urls: mediaUrls,
          };
          console.log(`[TaskRecovery] 任务 ${task.id} 的视频已上传到 MinIO`);
        } catch (error) {
          console.error(`[TaskRecovery] 存储视频到 MinIO 失败:`, error);
        }
      }

      // 更新任务状态为完成
      await taskManager.setTaskResult(task.id, {
        mediaUrls,
        storageInfo,
        metadata: {
          ...task.metadata,
          videoId: task.metadata?.taskId || task.metadata?.videoId,
          videoUrl,
        },
      });

      console.log(`[TaskRecovery] ✅ 任务 ${task.id} 已成功恢复为完成状态`);
    } catch (error) {
      console.error(`[TaskRecovery] 恢复 Sora 任务失败 (${task.id}):`, error);
      throw error;
    }
  }

  /**
   * 重试任务
   */
  private async retryTask(task: Task): Promise<void> {
    try {
      const { preparePipelineRetryExecute } = await import('./pipeline-retry');
      const fresh = await taskManager.getTask(task.id);
      const current = fresh?.task ?? task;
      const prepared = preparePipelineRetryExecute(current);

      await taskManager.updateTaskRequestParams(task.id, prepared.updatedParams);

      const bps = (prepared.updatedParams.businessPipelineState ?? {}) as Record<string, unknown>;
      if (bps.pipelineRenderRetry === true) {
        try {
          const storage = (taskManager as { storage?: { update: (id: string, u: unknown) => Promise<void> } })
            .storage;
          if (storage) {
            const meta = { ...(current.metadata ?? {}) } as Record<string, unknown>;
            delete meta.videoEditRenderTaskId;
            delete meta.nestedVideoRenderPending;
            await storage.update(task.id, { metadata: meta });
          }
        } catch (metaErr) {
          console.warn('[TaskRecovery] 清除 nested render metadata 失败:', metaErr);
        }
      }

      await taskManager.updateTaskStatus(task.id, 'queued', {
        progress: prepared.resumeProgress,
        error: undefined,
        logs: [prepared.retryMessage],
      });

      const execParams = prepared.updatedParams as Record<string, unknown>;
      await taskExecutor.executeTask({
        taskId: task.id,
        modelName: task.metadata.model,
        provider: task.metadata.provider as any,
        params: execParams,
        userId: task.metadata.userId,
        storeToMinio: task.metadata.storeToMinio,
        storageConfig: task.metadata.storageConfig,
      });

      console.log(`[TaskRecovery] 任务 ${task.id} 已断点重试（progress≈${prepared.resumeProgress}%）`);
    } catch (error) {
      console.error(`[TaskRecovery] 重试任务失败 (${task.id}):`, error);
      await taskManager.setTaskError(
        task.id,
        `任务重试失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 自动剪辑管线：逐段渲染子任务已完成但父任务未续跑，或 nested render 长期无进展
   */
  private async tryRecoverStuckVideoPipelineRender(task: Task): Promise<boolean> {
    const model = String(task.metadata?.model ?? '');
    if (task.type !== 'video' || model !== 'video-pipeline-orchestrator') return false;

    const { getMergedPipelineState } = await import('./pipeline-retry');
    const bps = getMergedPipelineState(task);
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const renderPending =
      bps.nestedVideoRenderPending === true || meta.nestedVideoRenderPending === true;
    if (!renderPending || !bps.pendingPostResult) return false;

    const renderId = String(bps.videoEditRenderTaskId ?? meta.videoEditRenderTaskId ?? '').trim();
    const { taskExecutor } = await import('./task-executor');
    const { readParentPipelineTaskId } = await import('../tasks/nested-video-render');

    if (renderId) {
      const snap = await taskManager.getTask(renderId);
      if (snap?.task?.status === 'completed') {
        console.log(
          `[TaskRecovery] 视频管线 ${task.id} 逐段渲染已完成 (${renderId})，续跑父任务后置步骤`
        );
        await taskExecutor.resumeParentPipelineAfterNestedRender(task.id, renderId);
        return true;
      }
    }

    // 子任务 ID 错位：查找同父级已完成的 render 子任务
    try {
      const storage = (taskManager as any).storage;
      const repo = storage?.repository;
      if (repo?.listByUserId && task.metadata?.userId) {
        const list = await repo.listByUserId(String(task.metadata.userId), {
          limit: 50,
          taskType: 'video',
        });
        for (const row of list?.tasks ?? []) {
          if (row.id === task.id) continue;
          const full = await taskManager.getTask(row.id);
          const child = full?.task;
          if (!child || child.status !== 'completed') continue;
          if (readParentPipelineTaskId(child) !== task.id) continue;
          if (child.metadata?.pipelineNode !== 'pipeline:video-timeline-render') continue;
          console.log(
            `[TaskRecovery] 视频管线 ${task.id} 发现已完成 render 子任务 ${child.id}，续跑后置步骤`
          );
          await taskExecutor.resumeParentPipelineAfterNestedRender(task.id, child.id);
          return true;
        }
      }
    } catch (e) {
      console.warn('[TaskRecovery] 查找 render 子任务失败:', e);
    }

    if (this.config.autoRetry && bps.businessPipelinePostDeferred === true) {
      console.log(`[TaskRecovery] 视频管线 ${task.id} 逐段渲染卡住，触发断点重试（保留分镜）`);
      await this.retryTask(task);
      return true;
    }

    return false;
  }

  /**
   * Graph 在 20% 后若 worker 被杀（API 拆分/重启），会长期停在 processing；无进展超过阈值则视为孤儿
   */
  private isOrphanedGraphTask(task: Task, now: number): boolean {
    if (task.type !== 'graph' || task.status !== 'processing') return false;
    const p = task.progress?.progress ?? 0;
    if (p >= 80) return false;
    const staleMs = Number(process.env.GRAPH_TASK_ORPHAN_STALE_MS || 10 * 60 * 1000);
    const last = task.updatedAt.getTime();
    return now - last >= staleMs;
  }

  /**
   * 根据任务类型获取超时时间
   */
  private getTaskTimeout(taskType: string, defaultTimeout: number): number {
    // 视频分镜批量父任务不按超时判定，仅由子任务状态驱动更新
    if (taskType === 'video-batch-parent' || taskType === 'task-v2-batch-parent') {
      return 7 * 24 * 60 * 60 * 1000; // 7 天，实际不会用于标记父任务超时
    }
    // 图片生成任务通常需要更长时间
    if (taskType === 'image') {
      return defaultTimeout; // 使用配置的超时时间（默认 30 分钟）
    }
    // Graph 任务（图片生成，可能包含参考图，需要更长时间）
    if (taskType === 'graph') {
      return Math.max(defaultTimeout, 60 * 60 * 1000); // 至少 60 分钟（参考图处理可能需要更长时间）
    }
    // 文本生成任务通常较快
    if (taskType === 'text') {
      return Math.min(defaultTimeout, 10 * 60 * 1000); // 最多 10 分钟
    }
    // 写作任务通常较快（生成文章、大纲等）
    if (taskType === 'writing') {
      return Math.min(defaultTimeout, 15 * 60 * 1000); // 最多 15 分钟
    }
    // 视频生成任务需要更长时间（Sora/Deer 可能 5–15 分钟，高峰期可达 1–3 小时）
    if (taskType === 'video') {
      // 视频任务使用更长的超时时间：3 小时（与 deer.provider 轮询 maxAttempts 对齐）
      return Math.max(defaultTimeout, 180 * 60 * 1000); // 至少 3 小时
    }
    // 音频生成任务
    if (taskType === 'audio') {
      return defaultTimeout; // 使用配置的超时时间（默认 30 分钟）
    }
    // 其他类型使用默认值
    return defaultTimeout;
  }

  /**
   * 手动恢复指定任务
   */
  async recoverTask(taskId: string): Promise<void> {
    const task = await taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (task.status !== 'processing') {
      throw new Error(`任务 ${taskId} 状态不是 processing，无法恢复`);
    }

    await this.handleStuckTask(task.task);
  }

  /**
   * 手动重试指定任务
   */
  async retryTaskById(taskId: string): Promise<void> {
    const task = await taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (
      task.task.status !== 'failed' &&
      task.task.status !== 'processing' &&
      task.task.status !== 'network_error'
    ) {
      throw new Error(`任务 ${taskId} 状态不是 failed、network_error 或 processing，无法重试`);
    }

    await this.retryTask(task.task);
  }
}

// 单例实例
let _taskRecoveryService: TaskRecoveryService | null = null;

/**
 * 获取任务恢复服务实例
 * 如果已存在实例，返回现有实例；否则使用配置创建新实例
 */
export function getTaskRecoveryService(config?: TaskRecoveryConfig): TaskRecoveryService {
  if (!_taskRecoveryService) {
    _taskRecoveryService = new TaskRecoveryService(config);
  } else if (config) {
    // 如果已存在实例但提供了新配置，更新配置（重新创建实例）
    _taskRecoveryService.stop();
    _taskRecoveryService = new TaskRecoveryService(config);
  }
  return _taskRecoveryService;
}

// 导出单例（使用默认配置）
export const taskRecoveryService = getTaskRecoveryService();
