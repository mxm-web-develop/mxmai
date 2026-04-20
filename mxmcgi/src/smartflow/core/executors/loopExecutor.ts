/**
 * Loop 节点执行器 - 迭代与循环
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { ExecutorFactory } from './index';

export class LoopExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const {
        loop_mode = 'iteration',
        iterable,
        condition,
        item_variable = 'item',
        index_variable = 'index',
        max_iterations = 100,
        collect_output = true,
        output_variable = 'output',
        break_condition,
        loop_nodes = [],
        initial_value,
      } = node;

      switch (loop_mode) {
        case 'iteration':
          return this.executeIteration(
            node, context, iterable, item_variable, index_variable,
            collect_output, output_variable, break_condition, loop_nodes
          );
        case 'loop':
          return this.executeLoop(
            node, context, condition, item_variable, index_variable,
            max_iterations, collect_output, output_variable, break_condition,
            loop_nodes, initial_value
          );
        default:
          return this.createErrorResult(`Unknown loop mode: ${loop_mode}`);
      }
    } catch (error: any) {
      return this.createErrorResult(`Loop executor error: ${error.message}`);
    }
  }

  /**
   * iteration 模式: for item in list
   */
  private async executeIteration(
    node: SmartflowNode,
    context: ExecutionContext,
    iterable: string | undefined,
    itemVariable: string,
    indexVariable: string,
    collectOutput: boolean,
    outputVariable: string,
    breakCondition: string | undefined,
    loopNodes: string[]
  ): Promise<ExecutorResult> {
    if (!iterable) {
      return this.createErrorResult('Iteration mode requires iterable');
    }

    // 解析 iterable 获取数组
    const resolvedIterable = VariableResolver.resolve(iterable, context);
    let items: any[];
    try {
      items = JSON.parse(resolvedIterable);
    } catch {
      const value = VariableResolver.resolvePath(iterable.replace(/\{\{|\}\}/g, '').trim(), context);
      items = Array.isArray(value) ? value : [];
    }

    if (!Array.isArray(items)) {
      return this.createErrorResult(`Iterable is not an array: ${typeof items}`);
    }

    const collected: any[] = [];

    for (let i = 0; i < items.length; i++) {
      // 更新上下文变量
      context.variables[itemVariable] = items[i];
      context.variables[indexVariable] = i;

      // 检查中断条件
      if (breakCondition) {
        const resolvedBreak = VariableResolver.resolve(breakCondition, context);
        try {
          const shouldBreak = new Function(`return ${resolvedBreak}`)();
          if (shouldBreak) break;
        } catch {
          // 忽略条件解析错误，继续执行
        }
      }

      // 执行子图
      const iterationResult = await this.executeSubGraph(loopNodes, context);

      if (iterationResult.success && collectOutput) {
        collected.push(iterationResult.output);
      }
    }

    return this.createSuccessResult({
      [outputVariable]: collectOutput ? collected : null,
      count: collected.length,
      total_items: items.length,
      loop_mode: 'iteration',
    });
  }

  /**
   * loop 模式: while condition
   */
  private async executeLoop(
    node: SmartflowNode,
    context: ExecutionContext,
    condition: string | undefined,
    itemVariable: string,
    indexVariable: string,
    maxIterations: number,
    collectOutput: boolean,
    outputVariable: string,
    breakCondition: string | undefined,
    loopNodes: string[],
    initialValue: any
  ): Promise<ExecutorResult> {
    if (!condition) {
      return this.createErrorResult('Loop mode requires condition');
    }

    const collected: any[] = [];
    let accumulator = initialValue;
    let iteration = 0;

    while (iteration < maxIterations) {
      // 解析并评估循环条件
      const resolvedCondition = VariableResolver.resolve(condition, context);
      let shouldContinue: boolean;
      try {
        shouldContinue = !!new Function(`return ${resolvedCondition}`)();
      } catch {
        return this.createErrorResult(`Failed to evaluate loop condition: ${resolvedCondition}`);
      }

      if (!shouldContinue) break;

      // 更新上下文变量
      context.variables[itemVariable] = accumulator;
      context.variables[indexVariable] = iteration;

      // 检查中断条件
      if (breakCondition) {
        const resolvedBreak = VariableResolver.resolve(breakCondition, context);
        try {
          const shouldBreak = new Function(`return ${resolvedBreak}`)();
          if (shouldBreak) break;
        } catch {
          // 忽略条件解析错误
        }
      }

      // 执行子图
      const loopResult = await this.executeSubGraph(loopNodes, context);

      if (loopResult.success) {
        // 用子图输出更新 accumulator
        accumulator = loopResult.output;
        if (collectOutput) {
          collected.push(loopResult.output);
        }
      } else {
        // 子图执行失败，可选择继续或中断
        console.warn(`[LoopExecutor] Sub-graph iteration ${iteration} failed: ${loopResult.error}`);
      }

      iteration++;
    }

    return this.createSuccessResult({
      [outputVariable]: collectOutput ? collected : accumulator,
      final_value: accumulator,
      iterations: iteration,
      max_iterations: maxIterations,
      loop_mode: 'loop',
    });
  }

  /**
   * 执行子图中的节点
   */
  private async executeSubGraph(
    loopNodes: string[],
    context: ExecutionContext
  ): Promise<ExecutorResult> {
    if (loopNodes.length === 0) {
      return this.createSuccessResult(null);
    }

    // 从 schema 中查找子图节点
    const { nodes, edges } = context.smartflow.schema;
    const nodeMap = new Map<string, SmartflowNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    // 构建子图邻接表
    const subNodeSet = new Set(loopNodes);
    const adjacencyList = new Map<string, string[]>();

    for (const edge of edges) {
      if (subNodeSet.has(edge.from) && subNodeSet.has(edge.to)) {
        if (!adjacencyList.has(edge.from)) {
          adjacencyList.set(edge.from, []);
        }
        adjacencyList.get(edge.from)!.push(edge.to);
      }
    }

    let lastOutput: any = null;

    for (const nodeId of loopNodes) {
      const subNode = nodeMap.get(nodeId);
      if (!subNode) {
        console.warn(`[LoopExecutor] Sub-graph node not found: ${nodeId}, skipping`);
        continue;
      }

      const result = await ExecutorFactory.execute(
        subNode.type as any,
        subNode,
        context
      );

      if (!result.success) {
        return result;
      }

      if (result.output !== undefined) {
        context.nodeOutputs[nodeId] = result.output;
        lastOutput = result.output;
      }
    }

    return this.createSuccessResult(lastOutput);
  }
}
