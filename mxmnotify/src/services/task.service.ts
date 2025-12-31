/**
 * 任务管理服务
 * 用于创建、更新、查询生成任务
 */

import { getSupabaseClient } from '@mxmai/mxmdata';
import { logger } from '../utils/logger';

export interface GenerationTask {
  id: string;
  user_id: string;
  task_type: 'graph' | 'text';
  model_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  params?: Record<string, any>;
  result?: Record<string, any>;
  error_message?: string;
  started_at: Date | string;
  completed_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateTaskDto {
  user_id: string;
  task_type: 'graph' | 'text';
  model_name: string;
  prompt: string;
  params?: Record<string, any>;
}

export interface UpdateTaskDto {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  result?: Record<string, any>;
  error_message?: string;
}

export class TaskService {
  private supabase = getSupabaseClient();

  /**
   * 创建任务
   */
  async createTask(dto: CreateTaskDto): Promise<GenerationTask> {
    try {
      const { data, error } = await this.supabase
        .from('generation_tasks')
        .insert({
          user_id: dto.user_id,
          task_type: dto.task_type,
          model_name: dto.model_name,
          status: 'pending',
          prompt: dto.prompt,
          params: dto.params || {},
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create task: ${error.message}`);
      }

      logger.info(`Task created: ${data.id} for user ${dto.user_id}`);
      return data as GenerationTask;
    } catch (error) {
      logger.error('Failed to create task:', error);
      throw error;
    }
  }

  /**
   * 更新任务状态
   */
  async updateTask(taskId: string, dto: UpdateTaskDto): Promise<GenerationTask> {
    try {
      const updateData: any = {
        ...dto,
      };

      // 如果状态变为 completed 或 failed，设置完成时间
      if (dto.status === 'completed' || dto.status === 'failed') {
        updateData.completed_at = new Date().toISOString();
      }

      // 如果状态变为 processing，设置开始时间（如果还没有）
      if (dto.status === 'processing') {
        const { data: existingTask } = await this.supabase
          .from('generation_tasks')
          .select('started_at')
          .eq('id', taskId)
          .single();

        if (!existingTask?.started_at) {
          updateData.started_at = new Date().toISOString();
        }
      }

      const { data, error } = await this.supabase
        .from('generation_tasks')
        .update(updateData)
        .eq('id', taskId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update task: ${error.message}`);
      }

      logger.info(`Task updated: ${taskId}, status: ${dto.status}`);
      return data as GenerationTask;
    } catch (error) {
      logger.error('Failed to update task:', error);
      throw error;
    }
  }

  /**
   * 根据 ID 获取任务
   */
  async getTaskById(taskId: string): Promise<GenerationTask | null> {
    try {
      const { data, error } = await this.supabase
        .from('generation_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Failed to get task: ${error.message}`);
      }

      return data as GenerationTask;
    } catch (error) {
      logger.error('Failed to get task:', error);
      throw error;
    }
  }

  /**
   * 获取用户的任务列表
   */
  async getUserTasks(
    userId: string,
    options?: {
      status?: 'pending' | 'processing' | 'completed' | 'failed';
      task_type?: 'graph' | 'text';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tasks: GenerationTask[]; total: number }> {
    try {
      let query = this.supabase
        .from('generation_tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.task_type) {
        query = query.eq('task_type', options.task_type);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get user tasks: ${error.message}`);
      }

      return {
        tasks: (data || []) as GenerationTask[],
        total: count || 0,
      };
    } catch (error) {
      logger.error('Failed to get user tasks:', error);
      throw error;
    }
  }
}
