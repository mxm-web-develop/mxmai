/**
 * Smartflow 执行引擎 - 核心编排器
 */

import { 
  Smartflow, 
  SmartflowExecution,
  SmartflowNode,
  SmartflowEdge,
  ExecutionContext,
  FlowChainNode,
  CreateExecutionDto,
} from '../models/types';
import { ExecutorFactory, ExecutorResult } from '../executors';
import { VariableResolver } from '../variables/resolver';
import { ISmartflowRepository } from './repository';
import { ISmartflowExecutionRepository } from './executionRepository';
import { deliverToMxmnotify, enqueueOutboxEvent } from '../../../task/notification-outbox';
import {
  registerRunningExecution,
  unregisterRunningExecution,
  getStopSignal,
} from './execution-control';
import {
  hasEshopGarmentBatchFormSchema,
  normalizeEshopBatchInputData,
} from '../eshop-batch-input-normalize';

export interface ExecutionResult {
  success: boolean;
  execution: SmartflowExecution;
  error?: string;
}

export type FlowStopReason = 'pause' | 'cancel';

export interface FlowRunResult {
  success: boolean;
  output_data?: Record<string, any>;
  error?: string;
  stopReason?: FlowStopReason;
}

export class SmartflowEngine {
  private smartflowRepo: ISmartflowRepository;
  private executionRepo: ISmartflowExecutionRepository;

  constructor(
    smartflowRepo: ISmartflowRepository,
    executionRepo: ISmartflowExecutionRepository
  ) {
    this.smartflowRepo = smartflowRepo;
    this.executionRepo = executionRepo;
  }

  /**
   * 创建 Smartflow 执行实例，并在后台异步执行
   */
  async start(smartflowId: string, dto: CreateExecutionDto): Promise<{ execution: SmartflowExecution }> {
    const smartflow = await this.smartflowRepo.findById(smartflowId);
    if (!smartflow) {
      throw new Error(`Smartflow not found: ${smartflowId}`);
    }

    const execution = await this.executionRepo.create({
      smartflow_id: smartflowId,
      user_id: dto.user_id,
      conversation_id: dto.conversation_id,
      input_data: dto.input_data,
    });

    // fire-and-forget：后台执行（不阻塞 HTTP 请求）
    void this.runExecution(smartflow, execution, dto).catch((e) => {
      console.error('[SmartflowEngine] runExecution failed:', e instanceof Error ? e.message : e);
    });

    return { execution };
  }

  private async notifyExecutionStatus(input: {
    executionId: string;
    userId: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    statusMessage?: string;
    smartflow: { id: string; name: string };
    progress?: number;
    node?: { id: string; name?: string; type: string };
  }): Promise<void> {
    try {
      const now = new Date().toISOString();
      const event = {
        event_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        event_ts: now,
        module_type: 'mxmcgi' as const,
        task_id: input.executionId,
        user_id: input.userId,
        task_status: input.status,
        task_status_message: input.statusMessage,
        metadata: {
          task_type: 'smartflow',
          model_name: input.smartflow.name || input.smartflow.id,
          model_provider: 'smartflow',
          progress: input.progress,
          smartflow_id: input.smartflow.id,
          smartflow_name: input.smartflow.name,
          node_id: input.node?.id,
          node_name: input.node?.name,
          node_type: input.node?.type,
          task_snapshot: {
            id: input.executionId,
            type: 'smartflow',
            status: input.status,
            progress: { status: input.status, progress: input.progress },
            metadata: {
              label: input.smartflow.name,
              model: input.smartflow.name,
              provider: 'smartflow',
              userId: input.userId,
              smartflow_id: input.smartflow.id,
            },
            createdAt: now,
            updatedAt: now,
          },
        },
        notification_config: {
          notification_type: input.status === 'completed' ? 'reminder' : 'system',
          title:
            input.status === 'completed'
              ? `Smartflow 执行完成：${input.smartflow.name}`
              : input.status === 'failed'
                ? `Smartflow 执行失败：${input.smartflow.name}`
                : `Smartflow 状态更新：${input.smartflow.name}`,
          action_url: `/smartflow?executionId=${encodeURIComponent(input.executionId)}`,
        },
      };

      // Outbox：先落库，再尽力投递；任何异常都不能影响主执行
      try {
        await enqueueOutboxEvent(event as any);
      } catch (e) {
        try {
          await deliverToMxmnotify(event as any);
        } catch {
          // ignore
        }
        return;
      }

      try {
        await deliverToMxmnotify(event as any);
      } catch {
        // ignore
      }
    } catch (e) {
      // 通知失败不影响 smartflow 执行
      console.warn(
        '[SmartflowEngine] notifyExecutionStatus failed:',
        e instanceof Error ? e.message : e
      );
    }
  }

  private sanitizeForRecord(value: any, depth: number = 0): any {
    if (depth > 4) return '[truncated]';
    if (value == null) return value;
    if (typeof value === 'string') {
      if (value.startsWith('data:')) return '[data-url-omitted]';
      if (value.length > 4000) return `${value.slice(0, 4000)}...[truncated]`;
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      const arr = value.slice(0, 30).map((v) => this.sanitizeForRecord(v, depth + 1));
      if (value.length > 30) arr.push(`[...+${value.length - 30} more]`);
      return arr;
    }
    if (typeof value === 'object') {
      const out: Record<string, any> = {};
      const entries = Object.entries(value as Record<string, any>).slice(0, 60);
      for (const [k, v] of entries) out[k] = this.sanitizeForRecord(v, depth + 1);
      if (Object.keys(value as any).length > 60) out.__truncated__ = true;
      return out;
    }
    return String(value);
  }

  /**
   * 执行 Smartflow（后台任务）
   */
  private async resolveStopReason(executionId: string): Promise<FlowStopReason | null> {
    const signal = getStopSignal(executionId);
    if (signal === 'pause' || signal === 'cancel') return signal;
    const row = await this.executionRepo.findById(executionId);
    if (row?.status === 'paused') return 'pause';
    if (row?.status === 'cancelled') return 'cancel';
    return null;
  }

  private async runExecution(
    smartflow: Smartflow,
    execution: SmartflowExecution,
    dto: CreateExecutionDto
  ): Promise<void> {
    registerRunningExecution(execution.id);

    let inputData = (dto.input_data ?? {}) as Record<string, unknown>;
    const startNode = smartflow.schema?.nodes?.find((n) => n.type === 'start');
    const startFormSchema = (startNode as { formSchema?: unknown } | undefined)?.formSchema;
    if (hasEshopGarmentBatchFormSchema(startFormSchema)) {
      inputData = normalizeEshopBatchInputData(inputData);
    }

    const context: ExecutionContext = {
      execution,
      smartflow,
      nodeOutputs: {},
      variables: {
        input: inputData,
        smartflow: {
          id: smartflow.id,
          name: smartflow.name,
        },
      },
    };

    try {
      const preStop = await this.resolveStopReason(execution.id);
      if (preStop) {
        await this.finalizeStoppedExecution(execution.id, dto, smartflow, context, preStop);
        return;
      }

      await this.executionRepo.updateStatus(execution.id, 'running');
      context.execution.status = 'running';
      await this.executionRepo.updateProgress(execution.id, 0);
      await this.notifyExecutionStatus({
        executionId: execution.id,
        userId: dto.user_id,
        status: 'running',
        statusMessage: 'Smartflow 开始执行',
        smartflow: { id: smartflow.id, name: smartflow.name },
        progress: 0,
      });

      const result = await this.executeFlow(smartflow, context, dto);
      if (result.stopReason) {
        await this.finalizeStoppedExecution(
          execution.id,
          dto,
          smartflow,
          context,
          result.stopReason,
          result.error,
        );
        return;
      }
      if (result.success) {
        await this.executionRepo.updateStatus(execution.id, 'completed');
        context.execution.status = 'completed';
        await this.executionRepo.updateProgress(execution.id, 100);
        await this.executionRepo.updateOutput(execution.id, result.output_data || {});
        try {
          const { extractOpenApiContext } = await import('../../../open-api/context');
          const { finalizeSmartflowOpenApiUsage, failOpenApiUsage } = await import('../../../open-api/usage');
          const openCtx = extractOpenApiContext(dto.input_data as Record<string, unknown>);
          if (openCtx) {
            const since =
              execution.started_at != null
                ? new Date(execution.started_at as string | Date).toISOString()
                : execution.created_at != null
                  ? new Date(execution.created_at as string | Date).toISOString()
                  : new Date(Date.now() - 3600_000).toISOString();
            await finalizeSmartflowOpenApiUsage(
              execution.id,
              openCtx.billingUserId,
              openCtx.publishedSlug,
              since
            );
          }
        } catch {
          // ignore
        }
        await this.notifyExecutionStatus({
          executionId: execution.id,
          userId: dto.user_id,
          status: 'completed',
          statusMessage: 'Smartflow 执行完成',
          smartflow: { id: smartflow.id, name: smartflow.name },
          progress: 100,
        });
      } else {
        await this.executionRepo.updateStatus(execution.id, 'failed');
        context.execution.status = 'failed';
        await this.executionRepo.updateError(execution.id, result.error || 'Unknown error');
        try {
          const { extractOpenApiContext } = await import('../../../open-api/context');
          const { failOpenApiUsage } = await import('../../../open-api/usage');
          const openCtx = extractOpenApiContext(dto.input_data as Record<string, unknown>);
          if (openCtx) await failOpenApiUsage(execution.id, result.error);
        } catch {
          // ignore
        }
        await this.notifyExecutionStatus({
          executionId: execution.id,
          userId: dto.user_id,
          status: 'failed',
          statusMessage: result.error || 'Smartflow 执行失败',
          smartflow: { id: smartflow.id, name: smartflow.name },
          progress: context.execution.progress,
        });
      }
    } catch (error: any) {
      await this.executionRepo.updateStatus(execution.id, 'failed');
      context.execution.status = 'failed';
      await this.executionRepo.updateError(execution.id, error.message);
      await this.notifyExecutionStatus({
        executionId: execution.id,
        userId: dto.user_id,
        status: 'failed',
        statusMessage: error.message,
        smartflow: { id: smartflow.id, name: smartflow.name },
      });
    } finally {
      unregisterRunningExecution(execution.id);
    }
  }

  private async finalizeStoppedExecution(
    executionId: string,
    dto: CreateExecutionDto,
    smartflow: Smartflow,
    context: ExecutionContext,
    reason: FlowStopReason,
    detail?: string,
  ): Promise<void> {
    const status = reason === 'pause' ? 'paused' : 'cancelled';
    const msg =
      detail ||
      (reason === 'pause' ? '执行已暂停' : '执行已取消');
    context.execution.status = status;
    await this.executionRepo.updateStatus(executionId, status);
    await this.executionRepo.updateError(executionId, msg);
    await this.notifyExecutionStatus({
      executionId,
      userId: dto.user_id,
      status,
      statusMessage: msg,
      smartflow: { id: smartflow.id, name: smartflow.name },
      progress: context.execution.progress,
    });
  }

  /**
   * 执行工作流图
   */
  private async executeFlow(
    smartflow: Smartflow, 
    context: ExecutionContext,
    dto: CreateExecutionDto
  ): Promise<FlowRunResult> {
    const { nodes, edges } = smartflow.schema;

    const nodeMap = new Map<string, SmartflowNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    const adjacencyList = new Map<string, string[]>();
    const conditionEdges: { edge: SmartflowEdge; condition: string }[] = [];
    
    for (const edge of edges) {
      if (!adjacencyList.has(edge.from)) {
        adjacencyList.set(edge.from, []);
      }
      
      if (edge.when) {
        conditionEdges.push({ edge, condition: edge.when });
      } else {
        adjacencyList.get(edge.from)!.push(edge.to);
      }
    }

    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) {
      return { success: false, error: 'No start node found' };
    }

    const endNode = nodes.find(n => n.type === 'end');
    if (!endNode) {
      return { success: false, error: 'No end node found' };
    }

    let currentNodeId: string | null = startNode.id;
    const visited = new Set<string>();

    while (currentNodeId && currentNodeId !== endNode.id) {
      const stopReason = await this.resolveStopReason(context.execution.id);
      if (stopReason) {
        return {
          success: false,
          stopReason,
          error: stopReason === 'pause' ? '执行已暂停' : '执行已取消',
        };
      }

      if (visited.has(currentNodeId)) {
        return { success: false, error: `Circular dependency detected at node: ${currentNodeId}` };
      }
      visited.add(currentNodeId);

      const node = nodeMap.get(currentNodeId);
      if (!node) {
        return { success: false, error: `Node not found: ${currentNodeId}` };
      }

      const flowChainNode: FlowChainNode = {
        node_id: node.id,
        node_name: node.name || node.id,
        node_type: node.type,
        state: 'processing',
        timestamp: Date.now(),
      };
      flowChainNode.input = this.sanitizeForRecord({
        input_data: context.execution.input_data,
        variables: context.variables,
        node: {
          id: node.id,
          type: node.type,
          name: node.name,
          ...(node.params ? { params: node.params } : {}),
          ...(node.prompt ? { prompt: node.prompt } : {}),
          ...(node.model ? { model: node.model } : {}),
          ...(node.model_type ? { model_type: node.model_type } : {}),
          ...(node.business_scope ? { business_scope: node.business_scope } : {}),
          ...(node.taskKey ? { taskKey: node.taskKey } : {}),
          ...(node.subtype ? { subtype: node.subtype } : {}),
        },
      });
      await this.executionRepo.appendFlowChain(context.execution.id, flowChainNode);
      await this.notifyExecutionStatus({
        executionId: context.execution.id,
        userId: dto.user_id,
        status: 'running',
        statusMessage: `节点开始：${node.name || node.id}`,
        smartflow: { id: smartflow.id, name: smartflow.name },
        progress: context.execution.progress,
        node: { id: node.id, name: node.name, type: node.type },
      });

      const startTime = Date.now();
      const result = await ExecutorFactory.execute(node.type, node, context);
      const duration = Date.now() - startTime;

      flowChainNode.duration = duration;

      if (!result.success) {
        flowChainNode.state = 'failed';
        flowChainNode.error = result.error;
        await this.executionRepo.appendFlowChain(context.execution.id, {
          ...flowChainNode,
          output: result.output !== undefined ? this.sanitizeForRecord(result.output) : undefined,
        });
        await this.notifyExecutionStatus({
          executionId: context.execution.id,
          userId: dto.user_id,
          status: 'failed',
          statusMessage: `节点失败：${node.name || node.id} - ${result.error || ''}`,
          smartflow: { id: smartflow.id, name: smartflow.name },
          progress: context.execution.progress,
          node: { id: node.id, name: node.name, type: node.type },
        });
        
        return { 
          success: false, 
          error: `Node ${node.id} failed: ${result.error}`,
          output_data: result.output,
        };
      }

      if (result.output) {
        context.nodeOutputs[node.id] = result.output;
        flowChainNode.output = this.sanitizeForRecord(result.output);
      }

      flowChainNode.state = 'completed';
      await this.executionRepo.appendFlowChain(context.execution.id, flowChainNode);

      context.execution.progress = Math.round((visited.size / nodes.length) * 100);
      await this.executionRepo.updateProgress(context.execution.id, context.execution.progress);
      await this.notifyExecutionStatus({
        executionId: context.execution.id,
        userId: dto.user_id,
        status: 'running',
        statusMessage: `节点完成：${node.name || node.id}`,
        smartflow: { id: smartflow.id, name: smartflow.name },
        progress: context.execution.progress,
        node: { id: node.id, name: node.name, type: node.type },
      });

      currentNodeId = this.getNextNode(
        node.id, 
        node.type, 
        result.output, 
        adjacencyList, 
        conditionEdges,
        context
      ) ?? null;
    }

    if (currentNodeId === endNode.id) {
      const stopBeforeEnd = await this.resolveStopReason(context.execution.id);
      if (stopBeforeEnd) {
        return {
          success: false,
          stopReason: stopBeforeEnd,
          error: stopBeforeEnd === 'pause' ? '执行已暂停' : '执行已取消',
        };
      }

      // 构建 end node 的 flowChainNode
      const endFlowChainNode: FlowChainNode = {
        node_id: endNode.id,
        node_name: endNode.name || '结束',
        node_type: 'end',
        state: 'processing',
        timestamp: Date.now(),
      };

      const endStartTime = Date.now();
      const endResult = await ExecutorFactory.execute('end', endNode, context);
      endFlowChainNode.duration = Date.now() - endStartTime;

      if (!endResult.success) {
        endFlowChainNode.state = 'failed';
        endFlowChainNode.error = endResult.error;
        endFlowChainNode.output = this.sanitizeForRecord(endResult.output);
        await this.executionRepo.appendFlowChain(context.execution.id, endFlowChainNode);
        return {
          success: false,
          error: `End node failed: ${endResult.error}`,
        };
      }

      endFlowChainNode.state = 'completed';
      endFlowChainNode.output = this.sanitizeForRecord(endResult.output);
      await this.executionRepo.appendFlowChain(context.execution.id, endFlowChainNode);

      return {
        success: true,
        output_data: endResult.output?.outputs || endResult.output || {},
      };
    }

    return { success: false, error: 'Workflow ended unexpectedly' };
  }

  /**
   * 获取下一个节点
   */
  private getNextNode(
    currentNodeId: string,
    nodeType: string,
    nodeOutput: any,
    adjacencyList: Map<string, string[]>,
    conditionEdges: { edge: SmartflowEdge; condition: string }[],
    context: ExecutionContext
  ): string | null {
    if (nodeType === 'condition' && nodeOutput?.next_node) {
      return nodeOutput.next_node;
    }

    for (const { edge, condition } of conditionEdges) {
      if (edge.from === currentNodeId) {
        if (VariableResolver.evaluateCondition(condition, context)) {
          return edge.to;
        }
      }
    }

    const nextNodes = adjacencyList.get(currentNodeId);
    return nextNodes && nextNodes.length > 0 ? nextNodes[0] : null;
  }
}
