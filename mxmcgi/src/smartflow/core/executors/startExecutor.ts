/**
 * Start 节点执行器
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';

export class StartExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const inputData: Record<string, any> = {};
      
      if (node.input && Array.isArray(node.input)) {
        for (const inputItem of node.input) {
          const name = inputItem.name || 'input';
          inputData[name] = {
            content: inputItem.content,
            type: inputItem.type,
          };
        }
      }

      context.variables.input = context.execution.input_data || {};
      context.variables.expected_outputs = node.expected_outputs || [];
      context.variables.smartflow_name = node.smartflow_name || '';

      return this.createSuccessResult({
        input: context.variables.input,
        expected_outputs: node.expected_outputs || [],
        smartflow_name: node.smartflow_name,
        trigger_words: node.trigger_words || [],
      });
    } catch (error: any) {
      return this.createErrorResult(`Start executor error: ${error.message}`);
    }
  }
}
