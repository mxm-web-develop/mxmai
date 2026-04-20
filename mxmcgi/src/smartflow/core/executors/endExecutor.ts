/**
 * End 节点执行器 - 输出验证和最终结果生成
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';

export class EndExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { 
        output_mapping = {}, 
        nullable_outputs = [],
        validate_outputs = true,
      } = node;

      const expectedOutputs = context.variables.expected_outputs || [];
      const requiredOutputs = expectedOutputs
        .filter((out: any) => out.required)
        .map((out: any) => out.name);

      const finalOutput: Record<string, any> = {};

      for (const [outputName, sourceRef] of Object.entries(output_mapping)) {
        const resolved = VariableResolver.resolve(sourceRef as string, context);
        finalOutput[outputName] = resolved;
      }

      if (validate_outputs) {
        for (const required of requiredOutputs) {
          if (!(required in finalOutput) || finalOutput[required] === undefined || finalOutput[required] === null) {
            if (!nullable_outputs.includes(required)) {
              return this.createErrorResult(`Required output "${required}" is missing or null`);
            }
          }
        }
      }

      return this.createSuccessResult({
        outputs: finalOutput,
        validation_passed: true,
      });
    } catch (error: any) {
      return this.createErrorResult(`End executor error: ${error.message}`);
    }
  }
}
