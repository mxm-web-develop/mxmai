/**
 * Loop 节点执行器
 * 对数组进行迭代处理，循环执行指定的节点
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import { VariableResolver } from './variable-resolver';

/**
 * Loop 节点执行器
 * 
 * 功能：
 * 1. 解析 iterable 表达式，获取要循环的数组
 * 2. 对数组中的每个元素，循环执行 loop_nodes 中指定的节点
 * 3. 收集循环中所有节点的输出
 * 4. 返回循环结果
 */
export class LoopExecutor {
  /**
   * 执行 loop 节点
   * 
   * 注意：loop 节点需要访问 nodeMap 来执行 loop_nodes 中的节点
   * 但当前设计下，执行器无法直接访问 nodeMap
   * 因此，我们需要通过 context 传递 nodeMap，或者修改引擎逻辑
   * 
   * 方案：在 context 中添加 nodeMap 和 executeNode 函数
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 验证必需字段
      if (!node.iterable) {
        return {
          success: false,
          error: 'Loop 节点缺少必需字段: iterable',
        };
      }
      
      if (!node.item_variable) {
        return {
          success: false,
          error: 'Loop 节点缺少必需字段: item_variable',
        };
      }
      
      if (!node.loop_nodes || node.loop_nodes.length === 0) {
        return {
          success: false,
          error: 'Loop 节点缺少必需字段: loop_nodes（必须至少包含一个节点 ID）',
        };
      }
      
      // 1. 解析 iterable 表达式，获取要循环的数组
      const iterable = VariableResolver.resolve(node.iterable, context);
      
      // 2. 验证是数组
      if (!Array.isArray(iterable)) {
        return {
          success: false,
          error: `Loop 节点的 iterable 必须是数组，当前类型: ${typeof iterable}，值: ${JSON.stringify(iterable).substring(0, 100)}`,
        };
      }
      
      // 3. 检查最大循环次数
      const maxIterations = node.max_iterations || 100;
      if (iterable.length > maxIterations) {
        return {
          success: false,
          error: `循环次数超过最大限制: ${maxIterations}（当前数组长度: ${iterable.length}）`,
        };
      }
      
      // 4. 获取 nodeMap 和 executeNode 函数（从 context 中获取）
      const nodeMap = context.nodeMap as Map<string, any>;
      const executeNodeFunc = context.executeNode as (
        node: any,
        context: ExecutionContext
      ) => Promise<NodeExecutionResult>;
      
      if (!nodeMap || !executeNodeFunc) {
        return {
          success: false,
          error: 'Loop 节点执行需要 nodeMap 和 executeNode 函数，请确保引擎正确传递这些参数',
        };
      }
      
      // 5. 循环执行
      const results: any[] = [];
      const collectedOutputs: any[] = [];
      
      for (let i = 0; i < iterable.length; i++) {
        const item = iterable[i];
        
        // 创建循环上下文（扩展原始上下文）
        const loopContext: ExecutionContext = {
          ...context,
          // 设置循环变量
          [node.item_variable]: item,
          [`${node.id}.item`]: item,
        };
        
        // 设置索引变量（如果指定）
        if (node.index_variable) {
          loopContext[node.index_variable] = i;
          loopContext[`${node.id}.index`] = i;
        }
        
        // 执行循环内的节点
        const nodeOutputs: Record<string, any> = {};
        let shouldBreak = false;
        
        for (const loopNodeId of node.loop_nodes) {
          // 从 nodeMap 获取节点
          const loopNode = nodeMap.get(loopNodeId);
          if (!loopNode) {
            return {
              success: false,
              error: `Loop 节点中指定的节点不存在: ${loopNodeId}`,
            };
          }
          
          // 执行节点
          const result = await executeNodeFunc(loopNode, loopContext);
          
          if (!result.success) {
            // 循环中节点失败的处理策略
            // 默认：停止循环并返回错误
            return {
              success: false,
              error: `循环中节点执行失败: ${loopNodeId} - ${result.error}`,
            };
          }
          
          // 存储节点输出
          nodeOutputs[loopNodeId] = result.output;
          
          // 更新上下文中的节点输出（供后续节点引用）
          loopContext.nodeOutputs[loopNodeId] = result.output;
          
          // 检查 break 条件
          if (node.break_condition) {
            const breakResult = VariableResolver.resolve(node.break_condition, loopContext);
            if (breakResult === true || breakResult === 'true') {
              shouldBreak = true;
              break;
            }
          }
        }
        
        // 收集本次循环的结果
        results.push({
          index: i,
          item: item,
          node_outputs: nodeOutputs,
        });
        
        // 如果 collect_output=true，收集特定字段
        if (node.collect_output !== false) {
          // 收集所有图片 URL
          for (const nodeOutput of Object.values(nodeOutputs)) {
            if (nodeOutput && typeof nodeOutput === 'object') {
              // 收集 image_urls 或 mediaUrls
              if (Array.isArray(nodeOutput.image_urls)) {
                collectedOutputs.push(...nodeOutput.image_urls);
              } else if (Array.isArray(nodeOutput.mediaUrls)) {
                collectedOutputs.push(...nodeOutput.mediaUrls);
              } else if (nodeOutput.image_urls && typeof nodeOutput.image_urls === 'string') {
                // 单个图片 URL（字符串格式）
                collectedOutputs.push(nodeOutput.image_urls);
              } else if (nodeOutput.mediaUrls && typeof nodeOutput.mediaUrls === 'string') {
                collectedOutputs.push(nodeOutput.mediaUrls);
              } else if (typeof nodeOutput === 'string') {
                // 如果输出本身就是字符串（可能是图片 URL）
                collectedOutputs.push(nodeOutput);
              }
            } else if (typeof nodeOutput === 'string') {
              // 字符串格式的图片 URL
              collectedOutputs.push(nodeOutput);
            }
          }
        }
        
        // 如果设置了 break 条件且满足，跳出循环
        if (shouldBreak) {
          break;
        }
      }
      
      // 6. 构建输出
      const output: any = {
        iterations: results.length,
        results: results,
      };
      
      // 如果 collect_output=true，添加收集的输出
      if (node.collect_output !== false) {
        const outputVarName = node.output_variable || 'collected_outputs';
        output[outputVarName] = collectedOutputs;
        // 同时设置到 context 中，供后续节点引用
        context[outputVarName] = collectedOutputs;
        context[`${node.id}.${outputVarName}`] = collectedOutputs;
      }
      
      return {
        success: true,
        output: output,
        metadata: {
          iterations: results.length,
          total_items: iterable.length,
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
