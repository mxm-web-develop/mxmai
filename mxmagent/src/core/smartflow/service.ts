/**
 * Smartflow 服务层
 * 提供便捷的 API 用于创建、执行和管理 Smartflow
 */

import {
  createSmartflowRepository,
  createSmartflowExecutionRepository,
} from '@mxmai/mxmdata';
import type {
  Smartflow,
  CreateSmartflowDto,
  UpdateSmartflowDto,
  SmartflowExecution,
} from '@mxmai/mxmdata';
import { SmartflowEngine } from './engine';

/**
 * Smartflow 服务
 */
export class SmartflowService {
  private engine: SmartflowEngine;

  constructor() {
    const smartflowRepo = createSmartflowRepository();
    const executionRepo = createSmartflowExecutionRepository();
    this.engine = new SmartflowEngine(smartflowRepo, executionRepo);
  }

  /**
   * 创建 Smartflow
   */
  async createSmartflow(data: CreateSmartflowDto): Promise<Smartflow> {
    const repo = createSmartflowRepository();
    return await repo.create(data);
  }

  /**
   * 获取 Smartflow
   */
  async getSmartflow(id: string): Promise<Smartflow | null> {
    const repo = createSmartflowRepository();
    return await repo.findById(id);
  }

  /**
   * 更新 Smartflow
   */
  async updateSmartflow(id: string, data: UpdateSmartflowDto): Promise<Smartflow> {
    const repo = createSmartflowRepository();
    return await repo.update(id, data);
  }

  /**
   * 删除 Smartflow
   */
  async deleteSmartflow(id: string): Promise<void> {
    const repo = createSmartflowRepository();
    return await repo.delete(id);
  }

  /**
   * 获取用户的 Smartflow 列表
   */
  async getUserSmartflows(
    userId: string,
    limit?: number,
    offset?: number
  ): Promise<Smartflow[]> {
    const repo = createSmartflowRepository();
    return await repo.findByUserId(userId, limit, offset);
  }

  /**
   * 获取公开的 Smartflow 列表
   */
  async getPublicSmartflows(
    limit?: number,
    offset?: number
  ): Promise<Smartflow[]> {
    const repo = createSmartflowRepository();
    return await repo.findPublic(limit, offset);
  }

  /**
   * 获取所有 Smartflow 列表（默认返回所有）
   */
  async getAllSmartflows(
    limit?: number,
    offset?: number
  ): Promise<Smartflow[]> {
    const repo = createSmartflowRepository();
    return await repo.findAll(limit, offset);
  }

  /**
   * 执行 Smartflow（创建 Task 并执行）
   */
  async executeSmartflow(
    smartflowId: string,
    userId: string,
    input: Array<{ content: any; type: string; name?: string }>,
    conversationId?: string,
    token?: string
  ): Promise<SmartflowExecution> {
    return await this.engine.execute(smartflowId, userId, input, conversationId, token);
  }

  /**
   * 获取执行实例（Task）详情
   */
  async getExecution(executionId: string): Promise<SmartflowExecution | null> {
    return await this.engine.getExecution(executionId);
  }

  /**
   * 获取用户的执行实例列表
   */
  async getUserExecutions(
    userId: string,
    limit?: number,
    offset?: number
  ): Promise<SmartflowExecution[]> {
    return await this.engine.getUserExecutions(userId, limit, offset);
  }

  /**
   * 停止执行任务
   */
  async stopExecution(executionId: string): Promise<void> {
    return await this.engine.stopExecution(executionId);
  }
}

/**
 * 创建 Smartflow 服务实例
 */
export function createSmartflowService(): SmartflowService {
  return new SmartflowService();
}
