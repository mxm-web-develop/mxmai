/**
 * Business 节点执行器 - v2 动态业务架构
 *
 * 统一调用 /api/v2/tasks 执行动态业务：
 * - scope: 业务大类（writing/graph/audio/video 等，由 mxmcgi 定义）
 * - taskKey: 具体业务标识，由 admin 在数据库创建（如 outlines、voice-scripts 等）
 * - subtype: 细分类型（可选）
 * - params: 动态参数，由 getTaskFormConfig 返回的 schema 定义
 *
 * 节点数据结构：
 * {
 *   type: 'business',
 *   business_scope: 'writing' | 'graph' | 'audio' | 'video',
 *   taskKey: 'outlines' | 'voice-scripts' | 'photograph' | ...,
 *   subtype?: 'tech-article' | 'news' | ...,
 *   params: { ... }
 * }
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { mxmCGIHttpClient } from '../../services/httpClient';

export class BusinessExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { business_scope, taskKey, subtype, params = {} } = node;

      if (!business_scope) {
        return this.createErrorResult('Business node requires business_scope');
      }
      if (!taskKey) {
        return this.createErrorResult('Business node requires taskKey');
      }

      const userId = context.execution?.user_id;
      if (!userId) {
        return this.createErrorResult('Business node execution requires user_id in context');
      }

      // 解析 params 中的变量引用
      const resolvedParams = this.resolveParams(params, context);

      // 统一调用 v2 /api/v2/tasks/run
      const result = await mxmCGIHttpClient.runTask(
        business_scope,
        taskKey,
        resolvedParams,
        userId,
        { subtype: subtype ?? null }
      );

      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Business executor error: ${error.message}`);
    }
  }

  /**
   * 解析 params 中的变量引用
   * 支持 {{input.xxx}}、{{nodeId.output.xxx}} 等变量语法
   */
  private resolveParams(params: Record<string, any>, context: ExecutionContext): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        resolved[key] = VariableResolver.resolve(value, context);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map((v) =>
          typeof v === 'string' ? VariableResolver.resolve(v, context) : v
        );
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }
}
