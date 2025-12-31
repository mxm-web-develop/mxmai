/**
 * 变量解析器
 * 解析 {{variable}} 格式的变量引用
 */

import type { ExecutionContext } from './types';

/**
 * 解析变量引用
 * 支持：
 * - {{input.xxx}} - 用户输入（从 start 节点的 input 获取）
 * - {{node_id.field}} - 节点输出
 */
export class VariableResolver {
  /**
   * 解析变量表达式
   */
  static resolve(expression: string, context: ExecutionContext): any {
    // 如果表达式不包含变量引用，直接返回
    if (!expression.includes('{{')) {
      return expression;
    }
    
    // 检查是否是单个变量引用（如 "{{variable}}" 或 "{{variable.field}}"）
    const singleVariablePattern = /^\s*\{\{([^}]+)\}\}\s*$/;
    const singleMatch = expression.match(singleVariablePattern);
    
    if (singleMatch) {
      // 单个变量引用，直接返回值（不转换为字符串）
      const varPath = singleMatch[1].trim();
      return this.resolveVariable(varPath, context);
    }
    
    // 多个变量引用或包含其他文本，替换所有 {{variable}} 占位符为字符串
    let resolved = expression;
    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = variablePattern.exec(expression)) !== null) {
      const fullMatch = match[0];  // {{variable}}
      const varPath = match[1];    // variable
      
      const value = this.resolveVariable(varPath, context);
      resolved = resolved.replace(fullMatch, String(value ?? ''));
    }
    
    return resolved;
  }
  
  /**
   * 解析单个变量路径
   */
  private static resolveVariable(
    varPath: string,
    context: ExecutionContext
  ): any {
    const parts = varPath.trim().split('.');
    
    if (parts.length === 0) {
      return undefined;
    }
    
    const [scope, ...path] = parts;
    
    // 解析作用域
    let base: any;
    switch (scope) {
      case 'input':
        base = context.input;
        break;
      default:
        // 可能是节点 ID，查找节点输出
        const nodeOutput = context.nodeOutputs[scope];
        if (nodeOutput !== undefined) {
          base = nodeOutput;
        } else {
          // 尝试从 context 中查找
          base = context[scope];
        }
        break;
    }
    
    if (base === undefined) {
      return undefined;
    }
    
    // 解析路径（如 node_id.response.text）
    if (path.length === 0) {
      // 如果是 input 作用域且值是 { type, content } 格式，自动提取 content
      if (scope === 'input' && typeof base === 'object' && base !== null && 'content' in base) {
        return base.content;
      }
      return base;
    }
    
    let current = base;
    for (const key of path) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object' && key in current) {
        current = current[key];
      } else if (typeof current === 'string' && (key === 'image_urls' || key === 'mediaUrls')) {
        // 如果节点输出是字符串（图片 URL），且访问的是 image_urls 或 mediaUrls，直接返回字符串
        // 这样 end-executor 的 validateOutputType 可以正确验证字符串格式的图片
        return current;
      } else {
        return undefined;
      }
    }
    
    // 如果最终值是 { type, content } 格式（input 字段），自动提取 content
    if (scope === 'input' && typeof current === 'object' && current !== null && 'content' in current) {
      return current.content;
    }
    
    return current;
  }
  
  /**
   * 检查表达式是否包含变量引用
   */
  static hasVariables(expression: string): boolean {
    return /\{\{([^}]+)\}\}/.test(expression);
  }
  
  /**
   * 提取表达式中的所有变量引用
   */
  static extractVariables(expression: string): string[] {
    const variables: string[] = [];
    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = variablePattern.exec(expression)) !== null) {
      variables.push(match[1].trim());
    }
    
    return variables;
  }
}
