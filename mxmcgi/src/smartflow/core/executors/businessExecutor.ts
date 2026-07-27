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
import { resolveSmartflowParams } from './resolve-smartflow-params';
import { runBusinessTaskForSmartflow } from './run-business-task';
import type { TaskScope } from '../../../tasks/types';

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
      const resolvedParams = resolveSmartflowParams(params, context) as Record<string, unknown>;

      const result = await runBusinessTaskForSmartflow(
        business_scope as TaskScope,
        taskKey,
        resolvedParams,
        userId,
        { subtype: subtype ?? null }
      );

      return this.createSuccessResult(result);
    } catch (error: any) {
      const details =
        error?.details != null
          ? ` ${JSON.stringify(error.details)}`
          : '';
      return this.createErrorResult(`Business executor error: ${error.message}${details}`);
    }
  }
}
