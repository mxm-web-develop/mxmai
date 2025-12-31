/**
 * Tools 节点执行器
 * 统一执行器，支持内置工具和用户自定义工具
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import type { ToolFunction, ToolContext, ToolResult } from './tool-interface';
import { VariableResolver } from './variable-resolver';
import { builtinTools } from './builtin-tools';

export class ToolsExecutor {
  /**
   * 执行 tools 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 验证必需字段
      if (!node.tool_type) {
        return {
          success: false,
          error: 'Tools 节点缺少必需字段: tool_type',
        };
      }
      
      // 解析工具参数中的变量
      const resolvedParams: Record<string, any> = {};
      if (node.tool_params) {
        for (const [key, value] of Object.entries(node.tool_params)) {
          if (typeof value === 'string') {
            resolvedParams[key] = VariableResolver.resolve(value, context);
          } else {
            resolvedParams[key] = value;
          }
        }
      }
      
      let result: ToolResult;
      
      // 根据工具类型执行
      if (node.tool_type === 'custom') {
        // 用户自定义工具
        result = await this.executeCustomTool(node, resolvedParams, context);
      } else {
        // 内置工具
        result = await this.executeBuiltinTool(node.tool_type, resolvedParams, context);
      }
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || '工具执行失败',
        };
      }
      
      return {
        success: true,
        output: result.data,
        metadata: result.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 执行内置工具
   */
  private static async executeBuiltinTool(
    toolType: string,
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const tool = builtinTools[toolType];
    
    if (!tool) {
      return {
        success: false,
        error: `内置工具 "${toolType}" 不存在`,
      };
    }
    
    const toolContext: ToolContext = {
      input: context.input,
      nodeOutputs: context.nodeOutputs,
    };
    
    return await tool.function(params, toolContext);
  }
  
  /**
   * 执行用户自定义工具
   */
  private static async executeCustomTool(
    node: SmartflowNode,
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!node.custom_code) {
      return {
        success: false,
        error: '自定义工具缺少代码',
      };
    }
    
    // TODO: 实现代码沙箱执行
    // 目前先返回错误，提示功能待实现
    return {
      success: false,
      error: '自定义工具执行功能待实现（需要代码沙箱）',
    };
  }
}
