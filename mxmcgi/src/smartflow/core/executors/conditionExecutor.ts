/**
 * Condition 节点执行器 - 条件分支逻辑
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';

export class ConditionExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { if: ifCondition, then, else_if = [], else: elseBranch } = node;

      if (!ifCondition || !then) {
        return this.createErrorResult('Condition node requires if and then fields');
      }

      const ifResult = VariableResolver.evaluateCondition(ifCondition, context);

      let nextNodeId: string = '';
      let conditionMet: string = '';

      if (ifResult) {
        nextNodeId = then;
        conditionMet = ifCondition;
      } else {
        let foundElseIf = false;
        for (const elseIf of else_if) {
          const elseIfResult = VariableResolver.evaluateCondition(elseIf.condition, context);
          if (elseIfResult) {
            nextNodeId = elseIf.then;
            conditionMet = elseIf.condition;
            foundElseIf = true;
            break;
          }
        }

        if (!foundElseIf) {
          if (!elseBranch) {
            return this.createErrorResult('No condition matched and no else branch defined');
          }
          nextNodeId = elseBranch;
          conditionMet = 'else';
        }
      }

      return this.createSuccessResult({
        next_node: nextNodeId,
        condition_met: conditionMet,
        if_result: ifResult,
      });
    } catch (error: any) {
      return this.createErrorResult(`Condition executor error: ${error.message}`);
    }
  }
}
