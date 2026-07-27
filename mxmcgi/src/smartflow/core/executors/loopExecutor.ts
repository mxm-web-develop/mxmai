/**
 * Loop 节点执行器 - 迭代与循环
 */

import { SmartflowNode, ExecutionContext, LoopIterationResultRow } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { ExecutorFactory } from './index';
import { runWithConcurrency } from '../utils/run-with-concurrency';
import {
  buildLoopIterationOutput,
  normalizeIterationRow,
  resolveLoopIterationErrorPolicy,
  applyIterationErrorPolicy,
} from './loop-iteration-result';

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
            node,
            context,
            iterable,
            item_variable,
            index_variable,
            collect_output,
            output_variable,
            break_condition,
            loop_nodes,
            node.parallel_iterations ?? false,
            node.max_concurrency ?? 3,
            resolveLoopIterationErrorPolicy(node.on_iteration_error)
          );
        case 'loop':
          return this.executeLoop(
            node,
            context,
            condition,
            item_variable,
            index_variable,
            max_iterations,
            collect_output,
            output_variable,
            break_condition,
            loop_nodes,
            initial_value
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
    loopNodes: string[],
    parallelIterations: boolean,
    maxConcurrency: number,
    errorPolicy: ReturnType<typeof resolveLoopIterationErrorPolicy>
  ): Promise<ExecutorResult> {
    if (!iterable) {
      return this.createErrorResult('Iteration mode requires iterable');
    }

    const resolvedIterable = VariableResolver.resolve(iterable, context);
    let items: unknown[];
    try {
      items = JSON.parse(resolvedIterable);
    } catch {
      const value = VariableResolver.resolvePath(iterable.replace(/\{\{|\}\}/g, '').trim(), context);
      items = Array.isArray(value) ? value : [];
    }

    if (!Array.isArray(items)) {
      return this.createErrorResult(`Iterable is not an array: ${typeof items}`);
    }

    const allRows: LoopIterationResultRow[] = [];
    let abort = false;

    const runOne = async (item: unknown, i: number): Promise<LoopIterationResultRow | undefined> => {
      if (abort && errorPolicy === 'fail_fast') return undefined;

      const iterContext = this.cloneContext(context);
      iterContext.variables[itemVariable] = item;
      iterContext.variables[indexVariable] = i;

      if (breakCondition && this.shouldBreak(breakCondition, iterContext)) {
        return undefined;
      }

      const iterationResult = await this.executeSubGraph(loopNodes, iterContext);
      const row = normalizeIterationRow(i, iterationResult);

      if (!row.success && errorPolicy === 'fail_fast') {
        abort = true;
      }

      return row;
    };

    if (parallelIterations && items.length > 1) {
      const rawRows = await runWithConcurrency(items, maxConcurrency, runOne, {
        shouldAbort: () => abort && errorPolicy === 'fail_fast',
      });
      for (const row of rawRows) {
        if (row != null) allRows.push(row);
      }
      allRows.sort((a, b) => a.index - b.index);
    } else {
      for (let i = 0; i < items.length; i++) {
        if (abort && errorPolicy === 'fail_fast') break;
        const row = await runOne(items[i], i);
        if (row != null) allRows.push(row);
        if (abort && errorPolicy === 'fail_fast') break;
      }
    }

    const outputPayload = buildLoopIterationOutput(allRows, errorPolicy, outputVariable, {
      total_items: items.length,
      parallel_iterations: parallelIterations,
      loop_mode: 'iteration',
    });

    if (!collectOutput) {
      return this.createSuccessResult(null);
    }

    const applied = applyIterationErrorPolicy(allRows, errorPolicy);
    if (!applied.loopSuccess) {
      return this.createErrorResult(applied.loopError ?? 'Loop iteration failed', outputPayload);
    }

    return this.createSuccessResult(outputPayload);
  }

  private cloneContext(context: ExecutionContext): ExecutionContext {
    return {
      execution: context.execution,
      smartflow: context.smartflow,
      nodeOutputs: structuredClone(context.nodeOutputs),
      variables: { ...context.variables },
    };
  }

  private shouldBreak(breakCondition: string, context: ExecutionContext): boolean {
    const resolvedBreak = VariableResolver.resolve(breakCondition, context);
    try {
      return !!new Function(`return ${resolvedBreak}`)();
    } catch {
      return false;
    }
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
    initialValue: unknown
  ): Promise<ExecutorResult> {
    if (!condition) {
      return this.createErrorResult('Loop mode requires condition');
    }

    const collected: unknown[] = [];
    let accumulator = initialValue;
    let iteration = 0;

    while (iteration < maxIterations) {
      const resolvedCondition = VariableResolver.resolve(condition, context);
      let shouldContinue: boolean;
      try {
        shouldContinue = !!new Function(`return ${resolvedCondition}`)();
      } catch {
        return this.createErrorResult(`Failed to evaluate loop condition: ${resolvedCondition}`);
      }

      if (!shouldContinue) break;

      context.variables[itemVariable] = accumulator;
      context.variables[indexVariable] = iteration;

      if (breakCondition) {
        const resolvedBreak = VariableResolver.resolve(breakCondition, context);
        try {
          const shouldBreak = new Function(`return ${resolvedBreak}`)();
          if (shouldBreak) break;
        } catch {
          // ignore
        }
      }

      const loopResult = await this.executeSubGraph(loopNodes, context);

      if (loopResult.success) {
        accumulator = loopResult.output;
        if (collectOutput) {
          collected.push(loopResult.output);
        }
      } else {
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

  private async executeSubGraph(
    loopNodes: string[],
    context: ExecutionContext
  ): Promise<ExecutorResult> {
    if (loopNodes.length === 0) {
      return this.createSuccessResult(null);
    }

    const { nodes } = context.smartflow.schema;
    const nodeMap = new Map<string, SmartflowNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    let lastOutput: unknown = null;

    for (const nodeId of loopNodes) {
      const subNode = nodeMap.get(nodeId);
      if (!subNode) {
        console.warn(`[LoopExecutor] Sub-graph node not found: ${nodeId}, skipping`);
        continue;
      }

      const result = await ExecutorFactory.execute(subNode.type as any, subNode, context);

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
