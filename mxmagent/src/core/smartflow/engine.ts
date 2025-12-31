/**
 * Smartflow 执行引擎
 * 负责执行 Smartflow 工作流，记录任务状态和节点输出
 */

import type {
  Smartflow,
  SmartflowExecution,
  CreateSmartflowExecutionDto,
  SmartflowNode,
  SmartflowEdge,
} from '@mxmai/mxmdata';
import type {
  ISmartflowRepository,
  ISmartflowExecutionRepository,
} from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './executors/types';
import {
  StartExecutor,
  ModelExecutor,
  ToolsExecutor,
  FormatterExecutor,
  RecallExecutor,
  ConditionExecutor,
  LoopExecutor,
  EndExecutor,
} from './executors';

/**
 * Smartflow 执行引擎
 */
export class SmartflowEngine {
  private smartflowRepo: ISmartflowRepository;
  private executionRepo: ISmartflowExecutionRepository;
  // 跟踪正在执行的任务，用于取消功能
  private runningTasks: Map<string, { cancelled: boolean; abortController?: AbortController }> = new Map();

  constructor(
    smartflowRepo: ISmartflowRepository,
    executionRepo: ISmartflowExecutionRepository
  ) {
    this.smartflowRepo = smartflowRepo;
    this.executionRepo = executionRepo;
  }

  /**
   * 执行 Smartflow（创建 Task 并异步执行）
   * 立即返回 task，实际执行在后台进行
   */
  async execute(
    smartflowId: string,
    userId: string,
    input: Array<{ content: any; type: string; name?: string }>,
    conversationId?: string,
    token?: string
  ): Promise<SmartflowExecution> {
    // 1. 获取 Smartflow 定义（验证存在性）
    const smartflow = await this.smartflowRepo.findById(smartflowId);
    if (!smartflow) {
      throw new Error(`Smartflow not found: ${smartflowId}`);
    }

    // 2. 创建执行实例（Task）
    const executionDto: CreateSmartflowExecutionDto = {
      smartflow_id: smartflowId,
      conversation_id: conversationId,
      user_id: userId,
      input_data: {
        input, // 将 input 数组存储到 input_data
      },
    };

    let execution = await this.executionRepo.create(executionDto);

    // 3. 更新状态为 pending（等待执行）
    execution = await this.executionRepo.updateStatus(execution.id, 'pending', 0);

    // 注册任务到 runningTasks Map，用于取消功能
    const abortController = new AbortController();
    this.runningTasks.set(execution.id, {
      cancelled: false,
      abortController,
    });

    // 4. 异步执行工作流（不阻塞返回）
    // 使用 setImmediate 确保在当前事件循环之后执行
    setImmediate(async () => {
      try {
        // 检查是否已被取消
        const taskInfo = this.runningTasks.get(execution.id);
        if (taskInfo?.cancelled) {
          await this.executionRepo.updateError(execution.id, 'Task was cancelled by user');
          await this.executionRepo.updateStatus(execution.id, 'failed', 0);
          this.runningTasks.delete(execution.id);
          return;
        }

        // 更新状态为 running
        await this.executionRepo.updateStatus(execution.id, 'running', 0);

        // 执行工作流
        const result = await this.runWorkflow(smartflow, execution, input, token, execution.id);

        // 检查是否在执行过程中被取消
        const finalTaskInfo = this.runningTasks.get(execution.id);
        if (finalTaskInfo?.cancelled) {
          await this.executionRepo.updateError(execution.id, 'Task was cancelled by user');
          await this.executionRepo.updateStatus(execution.id, 'failed', 0);
          this.runningTasks.delete(execution.id);
          return;
        }

        // 更新最终输出和状态
        await this.executionRepo.updateOutput(execution.id, result.output);
        await this.executionRepo.updateStatus(
          execution.id,
          'completed',
          100
        );
        
        // 清理任务跟踪
        this.runningTasks.delete(execution.id);
      } catch (error) {
        // 如果执行失败，更新错误信息
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // 检查是否是取消导致的错误
        const taskInfo = this.runningTasks.get(execution.id);
        if (taskInfo?.cancelled) {
          await this.executionRepo.updateError(execution.id, 'Task was cancelled by user');
          await this.executionRepo.updateStatus(execution.id, 'failed', 0);
          this.runningTasks.delete(execution.id);
          return;
        }
        
        // 检查是否是图片/视频生成节点的超时错误（任务可能还在replicate队列中处理）
        // 如果是，不应该立即标记task为失败，因为任务可能还在继续
        const isImageVideoTimeoutError = 
          errorMessage.includes('IMAGE_VIDEO_PROCESSING_TIMEOUT') ||
          (errorMessage.includes('Node execution failed') &&
           (errorMessage.includes('timeout') || 
            errorMessage.includes('Timeout') || 
            errorMessage.includes('超时') ||
            errorMessage.includes('任务正在处理中')));
        
        if (isImageVideoTimeoutError) {
          // 对于图片/视频生成的超时错误，不标记task为失败
          // 任务可能还在replicate队列中处理，保持running状态
          console.warn(`[SmartflowEngine] Image/Video generation timeout detected, keeping task in running state: ${errorMessage}`);
          await this.executionRepo.updateError(
            execution.id, 
            `任务处理中：图片/视频生成可能需要较长时间，任务仍在replicate队列中处理，请稍后查询状态。原始错误：${errorMessage.replace('IMAGE_VIDEO_PROCESSING_TIMEOUT: ', '')}`
          );
          // 不更新状态为failed，保持running状态
          // 清理任务跟踪（但保持running状态）
          this.runningTasks.delete(execution.id);
          return;
        }
        
        // 其他错误，正常标记为失败
        await this.executionRepo.updateError(execution.id, errorMessage);
        await this.executionRepo.updateStatus(
          execution.id,
          'failed',
          0
        );
        
        // 清理任务跟踪
        this.runningTasks.delete(execution.id);
      }
    });

    // 5. 立即返回 task（不等待执行完成）
    return execution;
  }

  /**
   * 停止执行任务
   */
  async stopExecution(executionId: string): Promise<void> {
    const taskInfo = this.runningTasks.get(executionId);
    if (!taskInfo) {
      // 任务不存在或已完成，检查数据库状态
      const execution = await this.executionRepo.findById(executionId);
      if (!execution) {
        throw new Error(`Task not found: ${executionId}`);
      }
      if (execution.status === 'completed' || execution.status === 'failed') {
        throw new Error(`Task already ${execution.status}: ${executionId}`);
      }
      // 如果任务在数据库中但不在 runningTasks 中，可能是刚创建还未开始执行
      // 标记为取消，等待执行时检查
      this.runningTasks.set(executionId, { cancelled: true });
      return;
    }

    // 标记为已取消
    taskInfo.cancelled = true;

    // 如果有 AbortController，触发取消
    if (taskInfo.abortController) {
      taskInfo.abortController.abort();
    }

    // 立即更新数据库状态
    await this.executionRepo.updateError(executionId, 'Task was cancelled by user');
    await this.executionRepo.updateStatus(executionId, 'failed', 0);
  }

  /**
   * 检查任务是否已取消
   */
  private isCancelled(executionId: string): boolean {
    const taskInfo = this.runningTasks.get(executionId);
    return taskInfo?.cancelled === true;
  }

  /**
   * 运行工作流
   */
  private async runWorkflow(
    smartflow: Smartflow,
    execution: SmartflowExecution,
    input: Array<{ content: any; type: string; name?: string }>,
    token?: string,
    executionId?: string
  ): Promise<{ output: Record<string, any> }> {
    const execId = executionId || execution.id;
    
    // 检查是否已取消
    if (this.isCancelled(execId)) {
      throw new Error('Task was cancelled');
    }
    const schema = smartflow.schema;
    const nodes = schema.nodes;
    const edges = schema.edges;

    // 构建节点映射
    const nodeMap = new Map<string, SmartflowNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // 构建边映射（from -> to[]）
    const edgeMap = new Map<string, string[]>();
    for (const edge of edges) {
      if (!edgeMap.has(edge.from)) {
        edgeMap.set(edge.from, []);
      }
      edgeMap.get(edge.from)!.push(edge.to);
    }
    
    // 收集所有 loop_nodes 中的节点 ID（这些节点不应该通过正常的边执行）
    const loopNodeIds = new Set<string>();
    for (const node of nodes) {
      if (node.type === 'loop' && node.loop_nodes) {
        for (const loopNodeId of node.loop_nodes) {
          loopNodeIds.add(loopNodeId);
        }
      }
    }

    // 初始化执行上下文
    const context: ExecutionContext = {
      input: {}, // 将在 start 节点中填充
      nodeOutputs: {},
      flowChain: [],
      token, // 传递用户 token 用于调用 mxmcgi
      // 为 loop 节点提供 nodeMap 和 executeNode 函数
      nodeMap: nodeMap,
      executeNode: async (node: SmartflowNode, ctx: ExecutionContext) => {
        return await this.executeNode(node, ctx, execution.id);
      },
    };

    // 找到 start 节点
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    // 将用户输入设置到 start 节点的 input 字段
    startNode.input = input;

    // 执行 start 节点
    await this.executeNode(startNode, context, execId);
    
    // 检查是否已取消
    if (this.isCancelled(execId)) {
      throw new Error('Task was cancelled');
    }

    // 从 start 节点开始执行
    const visited = new Set<string>();
    await this.executeNodeRecursive(
      startNode.id,
      nodeMap,
      edgeMap,
      context,
      execId,
      visited,
      loopNodeIds
    );
    
    // 检查是否已取消
    if (this.isCancelled(execId)) {
      throw new Error('Task was cancelled');
    }

    // 找到 end 节点并获取输出
    const endNode = nodes.find((n) => n.type === 'end');
    if (!endNode) {
      throw new Error('Workflow must have an end node');
    }

    const endResult = await this.executeNode(endNode, context, execId);
    if (!endResult.success || !endResult.output) {
      throw new Error('End node execution failed');
    }

    return { output: endResult.output };
  }

  /**
   * 递归执行节点
   */
  private async executeNodeRecursive(
    nodeId: string,
    nodeMap: Map<string, SmartflowNode>,
    edgeMap: Map<string, string[]>,
    context: ExecutionContext,
    executionId: string,
    visited: Set<string>,
    loopNodeIds?: Set<string>
  ): Promise<void> {
    // 检查是否已取消
    if (this.isCancelled(executionId)) {
      throw new Error('Task was cancelled');
    }
    
    if (visited.has(nodeId)) {
      return; // 避免循环
    }
    
    // 如果节点是 loop_nodes 的一部分，跳过（由 loop 节点内部管理）
    if (loopNodeIds && loopNodeIds.has(nodeId)) {
      return;
    }
    
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 执行节点
    const result = await this.executeNode(node, context, executionId);
    
    // 检查是否已取消
    if (this.isCancelled(executionId)) {
      throw new Error('Task was cancelled');
    }

    if (!result.success) {
      // 对于图片/视频生成节点，如果仍在处理中（isProcessing=true），抛出特殊错误
      // engine会捕获这个错误，不立即标记task为失败
      if (result.isProcessing && (node.type === 'model' && (node.model_type === 'image' || node.model_type === 'video'))) {
        // 抛出特殊错误，让engine知道这是处理中的状态，不是真正的失败
        throw new Error(`IMAGE_VIDEO_PROCESSING_TIMEOUT: Node ${nodeId} is still processing (image/video generation may take longer): ${result.error}`);
      } else {
        // 真正的失败，抛出错误
        throw new Error(`Node execution failed: ${nodeId} - ${result.error}`);
      }
    }

    // 存储节点输出
    context.nodeOutputs[nodeId] = result.output;

    // 确定下一个节点
    let nextNodeIds: string[] = [];

    if (node.type === 'condition' && result.nextNodes) {
      // 条件节点：使用执行结果指定的下一节点
      nextNodeIds = result.nextNodes;
    } else {
      // 普通节点：从边映射获取下一节点
      nextNodeIds = edgeMap.get(nodeId) || [];
    }

    // 递归执行下一节点
    for (const nextNodeId of nextNodeIds) {
      // 检查是否已取消
      if (this.isCancelled(executionId)) {
        throw new Error('Task was cancelled');
      }
      
      await this.executeNodeRecursive(
        nextNodeId,
        nodeMap,
        edgeMap,
        context,
        executionId,
        visited,
        loopNodeIds
      );
    }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: SmartflowNode,
    context: ExecutionContext,
    executionId: string
  ): Promise<NodeExecutionResult> {
    // 检查是否已取消
    if (this.isCancelled(executionId)) {
      return {
        success: false,
        error: 'Task was cancelled',
      };
    }
    
    const startTime = Date.now();

    // 记录节点开始执行
    await this.executionRepo.updateNodeOutput(
      executionId,
      node.id,
      node.name || node.id,
      'processing',
      context.input
    );
    
    // 再次检查是否已取消（可能在更新状态时被取消）
    if (this.isCancelled(executionId)) {
      return {
        success: false,
        error: 'Task was cancelled',
      };
    }

    let result: NodeExecutionResult;

    try {
      // 根据节点类型执行
      switch (node.type) {
        case 'start':
          result = await StartExecutor.execute(node, context);
          break;
        case 'model':
          result = await ModelExecutor.execute(node, context);
          break;
        case 'tools':
          result = await ToolsExecutor.execute(node, context);
          break;
        case 'formatter':
          result = await FormatterExecutor.execute(node, context);
          break;
        case 'recall':
          result = await RecallExecutor.execute(node, context);
          break;
        case 'condition':
          result = await ConditionExecutor.execute(node, context);
          break;
        case 'loop':
          result = await LoopExecutor.execute(node, context);
          break;
        case 'end':
          result = await EndExecutor.execute(node, context);
          break;
        default:
          throw new Error(`Unknown node type: ${(node as any).type}`);
      }

      const duration = Date.now() - startTime;

      // 记录节点执行完成
      await this.executionRepo.updateNodeOutput(
        executionId,
        node.id,
        node.name || node.id,
        result.success ? 'completed' : 'failed',
        context.input,
        result.output,
        result.error,
        duration
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 记录节点执行失败
      await this.executionRepo.updateNodeOutput(
        executionId,
        node.id,
        node.name || node.id,
        'failed',
        context.input,
        undefined,
        errorMessage,
        duration
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取执行实例（Task）详情
   */
  async getExecution(executionId: string): Promise<SmartflowExecution | null> {
    return await this.executionRepo.findById(executionId);
  }

  /**
   * 获取用户的执行实例列表
   */
  async getUserExecutions(
    userId: string,
    limit?: number,
    offset?: number
  ): Promise<SmartflowExecution[]> {
    return await this.executionRepo.findByUserId(userId, limit, offset);
  }
}
