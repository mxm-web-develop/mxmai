/**
 * Smartflow 执行仓库 - 管理执行实例
 */

import { 
  SmartflowExecution, 
  SmartflowExecutionStatus,
  CreateExecutionDto,
  FlowChainNode,
} from '../models/types';
import { getSupabaseClient } from '@mxmai/mxmdata';

export interface ISmartflowExecutionRepository {
  create(data: CreateExecutionDto): Promise<SmartflowExecution>;
  findById(id: string): Promise<SmartflowExecution | null>;
  findByUserId(userId: string, limit?: number, offset?: number): Promise<SmartflowExecution[]>;
  findBySmartflowId(smartflowId: string, limit?: number, offset?: number): Promise<SmartflowExecution[]>;
  updateStatus(id: string, status: SmartflowExecutionStatus): Promise<void>;
  updateProgress(id: string, progress: number): Promise<void>;
  updateOutput(id: string, output: Record<string, any>): Promise<void>;
  updateError(id: string, error: string): Promise<void>;
  appendFlowChain(id: string, node: FlowChainNode): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * 内存实现的执行仓库
 */
export class InMemorySmartflowExecutionRepository implements ISmartflowExecutionRepository {
  private executions: Map<string, SmartflowExecution> = new Map();

  async create(data: CreateExecutionDto): Promise<SmartflowExecution> {
    const now = new Date().toISOString();
    const execution: SmartflowExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      smartflow_id: data.smartflow_id,
      user_id: data.user_id,
      conversation_id: data.conversation_id,
      status: 'pending',
      progress: 0,
      input_data: data.input_data,
      flow_chain: [],
      created_at: now,
      updated_at: now,
    };
    this.executions.set(execution.id, execution);
    return execution;
  }

  async findById(id: string): Promise<SmartflowExecution | null> {
    return this.executions.get(id) || null;
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<SmartflowExecution[]> {
    const userExecutions = Array.from(this.executions.values())
      .filter(e => e.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return userExecutions.slice(offset, offset + limit);
  }

  async findBySmartflowId(smartflowId: string, limit: number = 50, offset: number = 0): Promise<SmartflowExecution[]> {
    const sfExecutions = Array.from(this.executions.values())
      .filter(e => e.smartflow_id === smartflowId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sfExecutions.slice(offset, offset + limit);
  }

  async updateStatus(id: string, status: SmartflowExecutionStatus): Promise<void> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    execution.status = status;
    execution.updated_at = new Date().toISOString();
    
    if (status === 'running') {
      execution.started_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'paused') {
      execution.completed_at = new Date().toISOString();
    }
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    execution.progress = progress;
    execution.updated_at = new Date().toISOString();
  }

  async updateOutput(id: string, output: Record<string, any>): Promise<void> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    execution.output_data = output;
    execution.updated_at = new Date().toISOString();
  }

  async updateError(id: string, error: string): Promise<void> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    execution.error_message = error;
    execution.updated_at = new Date().toISOString();
  }

  async appendFlowChain(id: string, node: FlowChainNode): Promise<void> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    execution.flow_chain = execution.flow_chain || [];
    execution.flow_chain.push(node);
    execution.updated_at = new Date().toISOString();
  }

  async delete(id: string): Promise<void> {
    if (!this.executions.delete(id)) {
      throw new Error(`Execution not found: ${id}`);
    }
  }
}

/**
 * Supabase 持久化实现的执行仓库
 */
export class SupabaseSmartflowExecutionRepository implements ISmartflowExecutionRepository {
  private supabase = getSupabaseClient();

  async create(data: CreateExecutionDto): Promise<SmartflowExecution> {
    const now = new Date().toISOString();
    const payload = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      smartflow_id: data.smartflow_id,
      conversation_id: data.conversation_id ?? null,
      user_id: data.user_id,
      status: 'pending',
      progress: 0,
      input_data: data.input_data ?? {},
      flow_chain: [],
      created_at: now,
      updated_at: now,
    };
    const { data: created, error } = await this.supabase
      .from('smartflow_executions')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create execution: ${error.message}`);
    return created as unknown as SmartflowExecution;
  }

  async findById(id: string): Promise<SmartflowExecution | null> {
    const { data, error } = await this.supabase
      .from('smartflow_executions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if ((error as any).code === 'PGRST116') return null;
      throw new Error(`Failed to find execution: ${error.message}`);
    }
    return (data as unknown as SmartflowExecution) ?? null;
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<SmartflowExecution[]> {
    const { data, error } = await this.supabase
      .from('smartflow_executions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to list executions by user: ${error.message}`);
    return (data as unknown as SmartflowExecution[]) ?? [];
  }

  async findBySmartflowId(smartflowId: string, limit: number = 50, offset: number = 0): Promise<SmartflowExecution[]> {
    const { data, error } = await this.supabase
      .from('smartflow_executions')
      .select('*')
      .eq('smartflow_id', smartflowId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to list executions by smartflow: ${error.message}`);
    return (data as unknown as SmartflowExecution[]) ?? [];
  }

  async updateStatus(id: string, status: SmartflowExecutionStatus): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'running') patch.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'paused') {
      patch.completed_at = new Date().toISOString();
    }
    const { error } = await this.supabase.from('smartflow_executions').update(patch).eq('id', id);
    if (error) throw new Error(`Failed to update execution status: ${error.message}`);
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    const { error } = await this.supabase
      .from('smartflow_executions')
      .update({ progress: p, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update execution progress: ${error.message}`);
  }

  async updateOutput(id: string, output: Record<string, any>): Promise<void> {
    const { error } = await this.supabase
      .from('smartflow_executions')
      .update({ output_data: output, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update execution output: ${error.message}`);
  }

  async updateError(id: string, errorMsg: string): Promise<void> {
    const { error } = await this.supabase
      .from('smartflow_executions')
      .update({ error_message: errorMsg, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update execution error: ${error.message}`);
  }

  async appendFlowChain(id: string, node: FlowChainNode): Promise<void> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Execution not found: ${id}`);
    const chain = Array.isArray(current.flow_chain) ? current.flow_chain : [];
    chain.push(node);
    const { error } = await this.supabase
      .from('smartflow_executions')
      .update({ flow_chain: chain, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to append flow_chain: ${error.message}`);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('smartflow_executions').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete execution: ${error.message}`);
  }
}

// 默认仓库实例
export const executionRepository = new SupabaseSmartflowExecutionRepository();
