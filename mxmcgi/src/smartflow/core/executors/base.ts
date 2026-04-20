/**
 * 节点执行器基类
 */

import { SmartflowNode, ExecutionContext } from '../models/types';

export interface ExecutorResult {
  success: boolean;
  output?: any;
  error?: string;
}

export abstract class BaseExecutor {
  abstract execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult>;

  protected createSuccessResult(output: any): ExecutorResult {
    return { success: true, output };
  }

  protected createErrorResult(error: string): ExecutorResult {
    return { success: false, error };
  }
}
