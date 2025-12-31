/**
 * Start 节点执行器
 * 初始化全局参数，验证触发词，设置预期输出结构
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';

export class StartExecutor {
  /**
   * 执行 start 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 处理用户输入参数
      const inputParams = node.input || [];
      const processedInput: Record<string, any> = {};
      const inputByType: Record<string, any[]> = {};
      
      // 按名称和类型组织输入
      for (const inputItem of inputParams) {
        const name = inputItem.name || inputItem.type;
        
        // 按名称存储
        if (inputItem.name) {
          processedInput[inputItem.name] = {
            content: inputItem.content,
            type: inputItem.type,
          };
        }
        
        // 按类型分组（方便后续处理）
        if (!inputByType[inputItem.type]) {
          inputByType[inputItem.type] = [];
        }
        inputByType[inputItem.type].push({
          name: inputItem.name,
          content: inputItem.content,
        });
        
        // 兼容旧格式：如果没有 name，使用类型作为 key
        if (!inputItem.name) {
          processedInput[inputItem.type] = inputItem.content;
        }
      }
      
      // 将处理后的输入存储到 context
      context.input = {
        ...context.input,
        ...processedInput,
      };
      
      // 存储输入类型信息（用于后续正确处理）
      context.input_types = inputByType;
      
      // 验证触发词（如果配置了）
      if (node.trigger_words && node.trigger_words.length > 0) {
        // 从文本类型输入中查找触发词
        const textInputs = inputByType.text || [];
        const allText = textInputs.map(item => String(item.content || '')).join(' ');
        
        const matched = node.trigger_words.some(word => 
          allText.includes(word)
        );
        
        if (!matched) {
          return {
            success: false,
            error: `用户输入不匹配触发词: ${node.trigger_words.join(', ')}`,
          };
        }
      }
      
      // 初始化预期输出结构
      const expectedOutputs = node.expected_outputs || [];
      const outputStructure: Record<string, any> = {};
      
      for (const expected of expectedOutputs) {
        outputStructure[expected.name] = null;
      }
      
      // 设置 smartflow 名称
      if (node.smartflow_name) {
        context.smartflow_name = node.smartflow_name;
      }
      
      // 存储预期输出到 context（供 end 节点使用）
      context.expected_outputs = expectedOutputs;
      
      return {
        success: true,
        output: {
          input: processedInput,
          input_types: inputByType,
          expected_outputs: expectedOutputs,
          smartflow_name: node.smartflow_name,
          output_structure: outputStructure,
        },
        metadata: {
          trigger_words: node.trigger_words,
          input_count: inputParams.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
