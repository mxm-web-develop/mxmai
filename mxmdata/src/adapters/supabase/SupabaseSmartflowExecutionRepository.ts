/**
 * Supabase Smartflow 执行实例数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { ISmartflowExecutionRepository } from '../../interfaces/ISmartflowExecutionRepository';
import type {
  SmartflowExecution,
  CreateSmartflowExecutionDto,
  SmartflowExecutionStatus,
} from '../../models/Smartflow';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseSmartflowExecutionRepository implements ISmartflowExecutionRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  /**
   * 根据 ID 查找执行实例
   */
  async findById(id: string): Promise<SmartflowExecution | null> {
    try {
      const { data, error } = await this.client
        .from('smartflow_executions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find smartflow execution by id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapToExecution(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding smartflow execution by id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 根据用户 ID 查找所有执行实例
   */
  async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<SmartflowExecution[]> {
    try {
      const { data, error } = await this.client
        .from('smartflow_executions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(
          `Failed to find smartflow executions by user id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToExecution(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding smartflow executions by user id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 根据 Smartflow ID 查找执行实例
   */
  async findBySmartflowId(
    smartflowId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<SmartflowExecution[]> {
    try {
      const { data, error } = await this.client
        .from('smartflow_executions')
        .select('*')
        .eq('smartflow_id', smartflowId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(
          `Failed to find smartflow executions by smartflow id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToExecution(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding smartflow executions by smartflow id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 创建执行实例（Task）
   */
  async create(data: CreateSmartflowExecutionDto): Promise<SmartflowExecution> {
    try {
      const now = new Date().toISOString();
      const executionData = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        smartflow_id: data.smartflow_id,
        conversation_id: data.conversation_id || null,
        user_id: data.user_id,
        status: 'pending' as SmartflowExecutionStatus,
        progress: 0,
        input_data: data.input_data,
        output_data: null,
        error_message: null,
        flow_chain: [],
        started_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      };

      const { data: result, error } = await this.client
        .from('smartflow_executions')
        .insert(executionData)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create smartflow execution: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToExecution(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating smartflow execution: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 更新执行状态
   */
  async updateStatus(
    id: string,
    status: SmartflowExecutionStatus,
    progress?: number
  ): Promise<SmartflowExecution> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (progress !== undefined) {
        updateData.progress = progress;
      }

      // 如果状态变为 running，设置 started_at
      if (status === 'running' && !updateData.started_at) {
        updateData.started_at = new Date().toISOString();
      }

      // 如果状态变为 completed 或 failed，设置 completed_at
      if ((status === 'completed' || status === 'failed') && !updateData.completed_at) {
        updateData.completed_at = new Date().toISOString();
      }

      const { data: result, error } = await this.client
        .from('smartflow_executions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('SmartflowExecution', id);
        }
        throw new DataAccessError(
          `Failed to update smartflow execution status: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapToExecution(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating smartflow execution status: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 更新节点输出（记录 flow_chain）
   */
  async updateNodeOutput(
    id: string,
    nodeId: string,
    nodeName: string,
    state: 'pending' | 'processing' | 'completed' | 'failed',
    input?: any,
    output?: any,
    error?: string,
    duration?: number
  ): Promise<SmartflowExecution> {
    try {
      // 先获取当前的 flow_chain
      const { data: current, error: fetchError } = await this.client
        .from('smartflow_executions')
        .select('flow_chain')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw new DataAccessError(
          `Failed to fetch smartflow execution: ${fetchError.message}`,
          'QUERY_ERROR',
          fetchError
        );
      }

      const flowChain = (current?.flow_chain || []) as Array<{
        node_id: string;
        node_name: string;
        state: string;
        input?: any;
        output?: any;
        error?: string;
        timestamp: number;
        duration?: number;
      }>;

      // 查找是否已存在该节点的记录
      const existingIndex = flowChain.findIndex((item) => item.node_id === nodeId);

      const nodeRecord = {
        node_id: nodeId,
        node_name: nodeName,
        state,
        input,
        output,
        error,
        timestamp: Date.now(),
        duration,
      };

      if (existingIndex >= 0) {
        // 更新现有记录
        flowChain[existingIndex] = nodeRecord;
      } else {
        // 添加新记录
        flowChain.push(nodeRecord);
      }

      const { data: result, error: updateError } = await this.client
        .from('smartflow_executions')
        .update({
          flow_chain: flowChain,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        if (updateError.code === 'PGRST116') {
          throw new NotFoundError('SmartflowExecution', id);
        }
        throw new DataAccessError(
          `Failed to update node output: ${updateError.message}`,
          'UPDATE_ERROR',
          updateError
        );
      }

      return this.mapToExecution(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating node output: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 更新最终输出
   */
  async updateOutput(id: string, outputData: Record<string, any>): Promise<SmartflowExecution> {
    try {
      const { data: result, error } = await this.client
        .from('smartflow_executions')
        .update({
          output_data: outputData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('SmartflowExecution', id);
        }
        throw new DataAccessError(
          `Failed to update output: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapToExecution(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating output: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 更新错误信息
   */
  async updateError(id: string, errorMessage: string): Promise<SmartflowExecution> {
    try {
      const { data: result, error } = await this.client
        .from('smartflow_executions')
        .update({
          error_message: errorMessage,
          status: 'failed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('SmartflowExecution', id);
        }
        throw new DataAccessError(
          `Failed to update error: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapToExecution(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating error: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 删除执行实例
   */
  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('smartflow_executions')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to delete smartflow execution: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting smartflow execution: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 映射数据库记录到 SmartflowExecution 模型
   */
  private mapToExecution(data: any): SmartflowExecution {
    return {
      id: data.id,
      smartflow_id: data.smartflow_id,
      conversation_id: data.conversation_id,
      user_id: data.user_id,
      status: data.status,
      progress: data.progress || 0,
      input_data: data.input_data || {},
      output_data: data.output_data,
      error_message: data.error_message,
      flow_chain: data.flow_chain || [],
      started_at: data.started_at,
      completed_at: data.completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
