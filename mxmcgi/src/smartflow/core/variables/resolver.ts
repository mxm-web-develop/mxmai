/**
 * 变量解析器 - 处理 {{variable}} 语法
 */

import { ExecutionContext } from '../models/types';

export class VariableResolver {
  /**
   * 解析包含变量的字符串
   */
  static resolve(template: string, context: ExecutionContext): string {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const pattern = /\{\{([^}]+)\}\}/g;
    return template.replace(pattern, (match, varPath) => {
      const value = this.resolvePath(varPath.trim(), context);
      if (value === undefined || value === null) {
        return match;
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  }

  /**
   * 解析变量路径
   */
  static resolvePath(path: string, context: ExecutionContext): any {
    const parts = path.split('.');
    const scope = parts[0];

    switch (scope) {
      case 'input':
        return this.getNestedValue(context.variables.input || {}, parts.slice(1));
      case 'variables':
        return this.getNestedValue(context.variables, parts.slice(1));
      default:
        // 尝试作为节点输出引用
        if (context.nodeOutputs[scope] !== undefined) {
          return context.nodeOutputs[scope];
        }
        // 尝试 nodeId.field 格式
        if (parts.length >= 2 && context.nodeOutputs[parts[0]]) {
          return this.getNestedValue(context.nodeOutputs[parts[0]], parts.slice(1));
        }
        return undefined;
    }
  }

  private static getNestedValue(obj: any, path: string[]): any {
    if (!obj || path.length === 0) return obj;
    let current = obj;
    for (const key of path) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  /**
   * 评估条件表达式
   */
  static evaluateCondition(condition: string, context: ExecutionContext): boolean {
    const resolved = this.resolve(condition, context);
    const safeCondition = resolved.replace(/[^><=!&|0-9a-zA-Z_. ]/g, '');
    
    try {
      const func = new Function(`return ${safeCondition}`);
      return !!func();
    } catch {
      return false;
    }
  }

  static hasVariables(template: string): boolean {
    return /\{\{[^}]+\}\}/.test(template);
  }

  static extractVariables(template: string): string[] {
    const pattern = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = pattern.exec(template)) !== null) {
      variables.push(match[1].trim());
    }
    return variables;
  }
}
