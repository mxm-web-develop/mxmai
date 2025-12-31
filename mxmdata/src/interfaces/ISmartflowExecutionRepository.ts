/**
 * Smartflow 执行实例数据仓库接口
 * 提供 Smartflow 执行任务（Task）的 CRUD 操作
 */

import type {
  SmartflowExecution,
  CreateSmartflowExecutionDto,
  SmartflowExecutionStatus,
} from '../models/Smartflow';

/**
 * Smartflow 执行实例数据仓库接口
 */
export interface ISmartflowExecutionRepository {
  /**
   * 根据 ID 查找执行实例
   */
  findById(id: string): Promise<SmartflowExecution | null>;

  /**
   * 根据用户 ID 查找所有执行实例
   */
  findByUserId(userId: string, limit?: number, offset?: number): Promise<SmartflowExecution[]>;

  /**
   * 根据 Smartflow ID 查找执行实例
   */
  findBySmartflowId(smartflowId: string, limit?: number, offset?: number): Promise<SmartflowExecution[]>;

  /**
   * 创建执行实例（Task）
   */
  create(data: CreateSmartflowExecutionDto): Promise<SmartflowExecution>;

  /**
   * 更新执行状态
   */
  updateStatus(
    id: string,
    status: SmartflowExecutionStatus,
    progress?: number
  ): Promise<SmartflowExecution>;

  /**
   * 更新节点输出（记录 flow_chain）
   */
  updateNodeOutput(
    id: string,
    nodeId: string,
    nodeName: string,
    state: 'pending' | 'processing' | 'completed' | 'failed',
    input?: any,
    output?: any,
    error?: string,
    duration?: number
  ): Promise<SmartflowExecution>;

  /**
   * 更新最终输出
   */
  updateOutput(id: string, outputData: Record<string, any>): Promise<SmartflowExecution>;

  /**
   * 更新错误信息
   */
  updateError(id: string, errorMessage: string): Promise<SmartflowExecution>;

  /**
   * 删除执行实例
   */
  delete(id: string): Promise<void>;
}
