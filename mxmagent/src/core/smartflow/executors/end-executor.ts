/**
 * End 节点执行器
 * 验证输出、应用映射、处理可置空输出
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import { VariableResolver } from './variable-resolver';

export class EndExecutor {
  /**
   * 执行 end 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 获取 start 节点的预期输出（从 context 中）
      const expectedOutputs = context.expected_outputs || [];
      const nullableOutputs = node.nullable_outputs || [];
      
      // 应用输出映射
      const mappedOutputs: Record<string, any> = {};
      
      if (node.output_mapping) {
        for (const [outputName, sourceExpression] of Object.entries(node.output_mapping)) {
          // 如果表达式不包含 {{}}，自动添加（支持两种格式：带 {{}} 和不带 {{}}）
          let expression = sourceExpression;
          if (typeof expression === 'string' && !expression.includes('{{')) {
            // 如果不包含 {{}}，自动添加
            expression = `{{${expression}}}`;
          }
          const value = VariableResolver.resolve(expression, context);
          mappedOutputs[outputName] = value;
        }
      }
      
      // 验证输出（如果启用）
      if (node.validate_outputs !== false) {
        const validation = this.validateOutputs(
          expectedOutputs,
          mappedOutputs,
          nullableOutputs
        );
        
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error || '输出验证失败',
          };
        }
      }
      
      // 构建最终输出
      const finalOutput: Record<string, any> = {};
      
      for (const expected of expectedOutputs) {
        const outputName = expected.name;
        const value = mappedOutputs[outputName];
        
        // 如果输出为空且在 nullable 列表中，允许为空
        if (value === null || value === undefined) {
          if (nullableOutputs.includes(outputName)) {
            finalOutput[outputName] = null;
          } else if (expected.required) {
            // 必需输出不能为空
            return {
              success: false,
              error: `必需输出 "${outputName}" 为空`,
            };
          } else {
            finalOutput[outputName] = null;
          }
        } else {
          // 验证类型
          if (!this.validateOutputType(value, expected.type)) {
            return {
              success: false,
              error: `输出 "${outputName}" 类型不匹配，期望 ${expected.type}`,
            };
          }
          
          finalOutput[outputName] = value;
        }
      }
      
      return {
        success: true,
        output: finalOutput,
        metadata: {
          output_count: Object.keys(finalOutput).length,
          validated: node.validate_outputs !== false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 验证输出
   */
  private static validateOutputs(
    expectedOutputs: Array<{ type: string; name: string; required: boolean }>,
    actualOutputs: Record<string, any>,
    nullableOutputs: string[]
  ): { valid: boolean; error?: string } {
    for (const expected of expectedOutputs) {
      const outputName = expected.name;
      const value = actualOutputs[outputName];
      
      // 检查必需输出
      if (expected.required && (value === null || value === undefined)) {
        if (!nullableOutputs.includes(outputName)) {
          return {
            valid: false,
            error: `必需输出 "${outputName}" 缺失`,
          };
        }
      }
      
      // 检查类型（如果值存在）
      if (value !== null && value !== undefined) {
        if (!this.validateOutputType(value, expected.type)) {
          return {
            valid: false,
            error: `输出 "${outputName}" 类型不匹配，期望 ${expected.type}`,
          };
        }
      }
    }
    
    return { valid: true };
  }
  
  /**
   * 验证输出类型
   */
  private static validateOutputType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'text':
        return typeof value === 'string' && value.length > 0;
      case 'image':
        // 支持多种格式：
        // 1. URL 字符串数组：['http://...', 'http://...']
        // 2. 单个 URL 字符串：'http://...'
        // 3. 对象格式：{ image_urls: [...], mediaUrls: [...] }
        if (Array.isArray(value)) {
          // 空数组表示生成失败，返回 false
          if (value.length === 0) {
            return false;
          }
          // 检查数组元素是否是有效的 URL
          return value.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
        }
        if (typeof value === 'string') {
          return value.startsWith('http') || value.startsWith('data:');
        }
        if (typeof value === 'object' && value !== null) {
          // 对象格式：检查是否有 image_urls 或 mediaUrls 字段
          if ('image_urls' in value) {
            const urls = value.image_urls;
            if (Array.isArray(urls)) {
              // 空数组表示生成失败
              if (urls.length === 0) {
                return false;
              }
              return urls.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
            }
            return typeof urls === 'string' && (urls.startsWith('http') || urls.startsWith('data:'));
          }
          if ('mediaUrls' in value) {
            const urls = value.mediaUrls;
            if (Array.isArray(urls)) {
              // 空数组表示生成失败
              if (urls.length === 0) {
                return false;
              }
              return urls.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
            }
            return typeof urls === 'string' && (urls.startsWith('http') || urls.startsWith('data:'));
          }
        }
        return false;
      case 'video':
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return false;
          }
          return value.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
        }
        if (typeof value === 'string') {
          return value.startsWith('http') || value.startsWith('data:');
        }
        if (typeof value === 'object' && value !== null && 'video_urls' in value) {
          const urls = value.video_urls;
          if (Array.isArray(urls)) {
            if (urls.length === 0) {
              return false;
            }
            return urls.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
          }
          return typeof urls === 'string' && (urls.startsWith('http') || urls.startsWith('data:'));
        }
        return false;
      case 'sound':
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return false;
          }
          return value.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
        }
        if (typeof value === 'string') {
          return value.startsWith('http') || value.startsWith('data:');
        }
        if (typeof value === 'object' && value !== null && 'audio_urls' in value) {
          const urls = value.audio_urls;
          if (Array.isArray(urls)) {
            if (urls.length === 0) {
              return false;
            }
            return urls.every((v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
          }
          return typeof urls === 'string' && (urls.startsWith('http') || urls.startsWith('data:'));
        }
        return false;
      case 'embedding':
        return Array.isArray(value) && value.length > 0 && value.every((v: any) => typeof v === 'number');
      default:
        return true; // 未知类型，不验证
    }
  }
}
