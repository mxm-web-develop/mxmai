/**
 * 执行器工厂 - 管理所有节点执行器
 */

import { NodeType } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { StartExecutor } from './startExecutor';
import { BusinessExecutor } from './businessExecutor';
import { ConditionExecutor } from './conditionExecutor';
import { EndExecutor } from './endExecutor';
import { VariableExecutor } from './variableExecutor';
import { LoopExecutor } from './loopExecutor';
import { ToolsExecutor } from './toolsExecutor';

export { ExecutorResult } from './base';

const executors: Partial<Record<NodeType, BaseExecutor>> = {
  start: new StartExecutor(),
  business: new BusinessExecutor(),
  variable: new VariableExecutor(),
  condition: new ConditionExecutor(),
  loop: new LoopExecutor(),
  end: new EndExecutor(),
  tools: new ToolsExecutor(),
};

export class ExecutorFactory {
  static getExecutor(type: NodeType): BaseExecutor {
    const executor = executors[type];
    if (!executor) {
      throw new Error(`No executor found for node type: ${type}`);
    }
    return executor;
  }

  static async execute(
    type: NodeType, 
    node: any, 
    context: any
  ): Promise<ExecutorResult> {
    const executor = this.getExecutor(type);
    return executor.execute(node, context);
  }
}
