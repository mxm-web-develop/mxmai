/**
 * Variable 节点执行器 - 数据抽离与聚合
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { extractJsonFromLlmText } from '../utils/extract-json-from-llm';

export type VariableOperation = 'select' | 'map' | 'filter' | 'reduce' | 'merge' | 'assign' | 'json_parse';

export class VariableExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const {
        operation = 'assign',
        source_node,
        source_path,
        output_name,
        default_value,
        iterable,
        initial_value,
      } = node;
      const expression = (node as any).expression as string | undefined;

      let result: any;

      switch (operation) {
        case 'select':
          result = this.executeSelect(source_node, source_path, context, default_value);
          break;
        case 'assign':
          result = this.executeAssign(source_node, source_path, expression, context, default_value);
          break;
        case 'map':
          result = this.executeMap(node, source_node, source_path, expression, context);
          break;
        case 'filter':
          result = this.executeFilter(source_node, source_path, expression, context);
          break;
        case 'reduce':
          result = this.executeReduce(source_node, source_path, expression, context, initial_value);
          break;
        case 'merge':
          result = this.executeMerge(source_node, source_path, iterable, context);
          break;
        case 'json_parse':
          result = this.executeJsonParse(source_node, source_path, context, default_value);
          break;
        default:
          return this.createErrorResult(`Unknown operation: ${operation}`);
      }

      const outputKey = output_name || 'output';
      return this.createSuccessResult({
        [outputKey]: result,
      });
    } catch (error: any) {
      return this.createErrorResult(`Variable executor error: ${error.message}`);
    }
  }

  /**
   * select: 从上游节点输出中提取字段
   */
  private executeSelect(
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    context: ExecutionContext,
    defaultValue: any
  ): any {
    if (!sourceNode || !sourcePath) {
      return defaultValue ?? null;
    }

    // 支持 {{nodeId.output.field}} 语法，也支持直接用 sourcePath 引用
    const resolvedPath = VariableResolver.resolve(`{{${sourceNode}.${sourcePath}}}`, context);
    if (resolvedPath && resolvedPath !== `{{${sourceNode}.${sourcePath}}}`) {
      try {
        return JSON.parse(resolvedPath);
      } catch {
        return resolvedPath;
      }
    }

    // 直接用 source_path 作为路径解析
    const value = VariableResolver.resolvePath(sourcePath, context);
    return value !== undefined ? value : defaultValue ?? null;
  }

  /**
   * assign: 直接赋值，支持默认值
   */
  private executeAssign(
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    expression: string | undefined,
    context: ExecutionContext,
    defaultValue: any
  ): any {
    // 如果有 expression，解析并执行
    if (expression) {
      const resolved = VariableResolver.resolve(expression, context);
      try {
        const func = new Function(`return ${resolved}`);
        return func();
      } catch {
        return resolved;
      }
    }

    // 如果有 source_node + source_path，提取字段
    if (sourceNode && sourcePath) {
      return this.executeSelect(sourceNode, sourcePath, context, defaultValue);
    }

    // 否则返回默认值
    return defaultValue ?? null;
  }

  /**
   * map: 对数组每个元素执行表达式映射
   */
  private executeMap(
    node: SmartflowNode,
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    expression: string | undefined,
    context: ExecutionContext
  ): any[] {
    if (!expression) {
      return [];
    }

    let array: any[] = [];
    if (sourceNode && sourcePath) {
      const resolved = VariableResolver.resolve(`{{${sourceNode}.${sourcePath}}}`, context);
      try {
        array = JSON.parse(resolved);
      } catch {
        const value = VariableResolver.resolvePath(sourcePath, context);
        array = Array.isArray(value) ? value : [];
      }
    } else if (sourcePath) {
      const value = VariableResolver.resolvePath(sourcePath, context);
      array = Array.isArray(value) ? value : [];
    }

    const resolvedExpr = VariableResolver.resolve(expression, context);
    const input = (context.variables.input ?? {}) as Record<string, unknown>;

    let planTasks: unknown[] = [];
    const planTasksFrom = (node as SmartflowNode & { plan_tasks_from?: string }).plan_tasks_from;
    if (planTasksFrom) {
      const resolved = VariableResolver.resolve(planTasksFrom, context);
      try {
        planTasks = JSON.parse(resolved);
      } catch {
        const v = VariableResolver.resolvePath(planTasksFrom.replace(/\{\{|\}\}/g, '').trim(), context);
        planTasks = Array.isArray(v) ? v : [];
      }
      if (!Array.isArray(planTasks)) planTasks = [];
    }

    return array.map((item, index) => {
      try {
        const func = new Function('item', 'index', 'input', 'planTasks', `return ${resolvedExpr}`);
        return func(item, index, input, planTasks);
      } catch (error: any) {
        return { _map_error: error.message, item, index };
      }
    });
  }

  private executeJsonParse(
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    context: ExecutionContext,
    defaultValue: unknown
  ): unknown {
    let raw: unknown;
    if (sourceNode && sourcePath) {
      raw = this.executeSelect(sourceNode, sourcePath, context, null);
    } else if (sourcePath) {
      raw = VariableResolver.resolvePath(sourcePath, context);
    } else {
      return defaultValue ?? null;
    }

    if (raw == null) return defaultValue ?? null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return defaultValue ?? null;

    const parsed = extractJsonFromLlmText(raw);
    return parsed ?? defaultValue ?? null;
  }

  /**
   * filter: 对数组过滤
   */
  private executeFilter(
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    expression: string | undefined,
    context: ExecutionContext
  ): any[] {
    if (!expression) {
      return [];
    }

    let array: any[] = [];
    if (sourceNode && sourcePath) {
      const resolved = VariableResolver.resolve(`{{${sourceNode}.${sourcePath}}}`, context);
      try {
        array = JSON.parse(resolved);
      } catch {
        const value = VariableResolver.resolvePath(sourcePath, context);
        array = Array.isArray(value) ? value : [];
      }
    } else if (sourcePath) {
      const value = VariableResolver.resolvePath(sourcePath, context);
      array = Array.isArray(value) ? value : [];
    }

    const resolvedExpr = VariableResolver.resolve(expression, context);

    return array.filter((item, index) => {
      try {
        const func = new Function('item', 'index', `return ${resolvedExpr}`);
        return !!func(item, index);
      } catch {
        return false;
      }
    });
  }

  /**
   * reduce: 对数组进行累积操作
   */
  private executeReduce(
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    expression: string | undefined,
    context: ExecutionContext,
    initialValue: any
  ): any {
    if (!expression) {
      return initialValue ?? null;
    }

    let array: any[] = [];
    if (sourceNode && sourcePath) {
      const resolved = VariableResolver.resolve(`{{${sourceNode}.${sourcePath}}}`, context);
      try {
        array = JSON.parse(resolved);
      } catch {
        const value = VariableResolver.resolvePath(sourcePath, context);
        array = Array.isArray(value) ? value : [];
      }
    } else if (sourcePath) {
      const value = VariableResolver.resolvePath(sourcePath, context);
      array = Array.isArray(value) ? value : [];
    }

    const resolvedExpr = VariableResolver.resolve(expression, context);
    let accumulator = initialValue;

    for (let index = 0; index < array.length; index++) {
      const item = array[index];
      try {
        const func = new Function('accumulator', 'item', 'index', `return ${resolvedExpr}`);
        accumulator = func(accumulator, item, index);
      } catch (error: any) {
        return { _reduce_error: error.message, accumulator, item, index };
      }
    }

    return accumulator;
  }

  /**
   * merge: 合并多个源的数据
   */
  private executeMerge(
    sourceNode: string | undefined,
    sourcePath: string | undefined,
    iterable: string | undefined,
    context: ExecutionContext
  ): any {
    const merged: any = {};

    // 合并 source_node 的输出
    if (sourceNode) {
      const nodeOutput = context.nodeOutputs[sourceNode];
      if (nodeOutput) {
        Object.assign(merged, nodeOutput);
      }
    }

    // 合并 source_path 指向的数据
    if (sourcePath) {
      const value = VariableResolver.resolvePath(sourcePath, context);
      if (value && typeof value === 'object') {
        Object.assign(merged, value);
      }
    }

    // 合并 iterable 指向的数据列表
    if (iterable) {
      const resolved = VariableResolver.resolve(iterable, context);
      try {
        const list = JSON.parse(resolved);
        if (Array.isArray(list)) {
          list.forEach((item, index) => {
            if (item && typeof item === 'object') {
              Object.assign(merged, item);
            }
          });
        }
      } catch {
        // ignore parse errors
      }
    }

    return merged;
  }
}
