/**
 * Condition 节点执行器
 * 支持 if/else if/else 条件判断和路由
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import { VariableResolver } from './variable-resolver';

export class ConditionExecutor {
  /**
   * 执行 condition 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 验证必需字段
      if (!node.if) {
        return {
          success: false,
          error: 'Condition 节点缺少必需字段: if',
        };
      }
      
      if (!node.then) {
        return {
          success: false,
          error: 'Condition 节点缺少必需字段: then',
        };
      }
      
      if (!node.else) {
        return {
          success: false,
          error: 'Condition 节点缺少必需字段: else',
        };
      }
      
      // 评估 if 条件
      const ifResult = this.evaluateCondition(node.if, context);
      if (ifResult) {
        return {
          success: true,
          output: {
            condition: node.if,
            result: true,
            matched: 'if',
          },
          nextNodes: [node.then],
        };
      }
      
      // 评估 else if 条件（如果有）
      if (node.else_if && node.else_if.length > 0) {
        for (const branch of node.else_if) {
          const elseIfResult = this.evaluateCondition(branch.condition, context);
          if (elseIfResult) {
            return {
              success: true,
              output: {
                condition: branch.condition,
                result: true,
                matched: 'else_if',
              },
              nextNodes: [branch.then],
            };
          }
        }
      }
      
      // 所有条件都不满足，执行 else
      return {
        success: true,
        output: {
          condition: node.if,
          result: false,
          matched: 'else',
        },
        nextNodes: [node.else],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 评估条件表达式
   */
  private static evaluateCondition(
    condition: string,
    context: ExecutionContext
  ): boolean {
    try {
      // 解析条件表达式中的变量
      const resolvedCondition = VariableResolver.resolve(condition, context);
      
      // 简单的条件表达式求值
      // 支持：==, ===, !=, !==, >, <, >=, <=, &&, ||, !
      // 注意：这里使用简单的字符串替换和 eval，生产环境应该使用更安全的表达式求值器
      
      // 先处理变量引用（已经通过 VariableResolver.resolve 处理）
      // 然后评估表达式
      
      // 为了安全，我们只支持简单的比较表达式
      // 实际应该使用专门的表达式求值库
      const result = this.safeEvaluate(resolvedCondition);
      return Boolean(result);
    } catch (error) {
      console.error('条件表达式求值失败:', error);
      return false;
    }
  }
  
  /**
   * 安全地求值表达式（简化版）
   * 注意：生产环境应该使用更安全的表达式求值器
   */
  private static safeEvaluate(expression: string): any {
    // 移除变量引用占位符（如果还有）
    let expr = expression.trim();
    
    // 处理简单的比较表达式
    // 支持：==, ===, !=, !==, >, <, >=, <=
    // 支持：&&, ||, !
    
    // 尝试解析为 JavaScript 表达式（仅用于简单表达式）
    // 注意：这里使用 eval 是不安全的，应该使用专门的表达式求值库
    // 例如：expr-eval, mathjs 等
    
    try {
      // 简单的布尔值检查
      if (expr === 'true' || expr === 'false') {
        return expr === 'true';
      }
      
      // 数字比较
      const numberMatch = expr.match(/^(\d+(?:\.\d+)?)\s*(==|===|!=|!==|>|<|>=|<=)\s*(\d+(?:\.\d+)?)$/);
      if (numberMatch) {
        const [, left, op, right] = numberMatch;
        const leftNum = parseFloat(left);
        const rightNum = parseFloat(right);
        
        switch (op) {
          case '==':
          case '===':
            return leftNum === rightNum;
          case '!=':
          case '!==':
            return leftNum !== rightNum;
          case '>':
            return leftNum > rightNum;
          case '<':
            return leftNum < rightNum;
          case '>=':
            return leftNum >= rightNum;
          case '<=':
            return leftNum <= rightNum;
        }
      }
      
      // 字符串比较
      const stringMatch = expr.match(/^(['"]?)(.+?)\1\s*(==|===|!=|!==)\s*(['"]?)(.+?)\4$/);
      if (stringMatch) {
        const [, , left, op, , right] = stringMatch;
        switch (op) {
          case '==':
          case '===':
            return left === right;
          case '!=':
          case '!==':
            return left !== right;
        }
      }
      
      // 默认：尝试作为 JavaScript 表达式求值（不安全，仅用于开发）
      // 生产环境应该使用专门的表达式求值库
      return eval(expr);
    } catch {
      // 如果无法求值，返回 false
      return false;
    }
  }
}
