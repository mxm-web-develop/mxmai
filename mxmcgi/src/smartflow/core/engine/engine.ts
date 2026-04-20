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

export interface ExecutionResult {
  success: boolean;
  execution: SmartflowExecution;
  error?: string;
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
   * 创建并执行 Smartflow
   */
  async execute(smartflowId: string, dto: CreateExecutionDto): Promise<ExecutionResult> {
    const smartflow = await this.smartflowRepo.findById(smartflowId);
    if (!smartflow) {
      return {
        success: false,
        execution: null as any,
        error: `Smartflow not found: ${smartflowId}`,
      };
    }

    const execution = await this.executionRepo.create({
      smartflow_id: smartflowId,
      user_id: dto.user_id,
      conversation_id: dto.conversation_id,
      input_data: dto.input_data,
    });

    const context: ExecutionContext = {
      execution,
      smartflow,
      nodeOutputs: {},
      variables: {
        input: dto.input_data,
        smartflow: {
          id: smartflow.id,
          name: smartflow.name,
        },
      },
    };

    await this.executionRepo.updateStatus(execution.id, 'running');
    context.execution.status = 'running';

    try {
      const result = await this.executeFlow(smartflow, context);

      const finalExecution = context.execution;
      if (result.success) {
        await this.executionRepo.updateStatus(finalExecution.id, 'completed');
        await this.executionRepo.updateOutput(finalExecution.id, result.output_data || {});
      } else {
        await this.executionRepo.updateStatus(finalExecution.id, 'failed');
        await this.executionRepo.updateError(finalExecution.id, result.error || 'Unknown error');
      }

      return { success: result.success, execution: context.execution, error: result.error };
    } catch (error: any) {
      await this.executionRepo.updateStatus(execution.id, 'failed');
      await this.executionRepo.updateError(execution.id, error.message);

      return {
        success: false,
        execution: context.execution,
        error: error.message,
      };
    }
  }

  /**
   * 执行工作流图
   */
  private async executeFlow(
    smartflow: Smartflow, 
    context: ExecutionContext
  ): Promise<{ success: boolean; output_data?: Record<string, any>; error?: string }> {
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

      const startTime = Date.now();
      const result = await ExecutorFactory.execute(node.type, node, context);
      const duration = Date.now() - startTime;

      flowChainNode.duration = duration;

      if (!result.success) {
        flowChainNode.state = 'failed';
        flowChainNode.error = result.error;
        context.execution.flow_chain?.push(flowChainNode);
        
        return { 
          success: false, 
          error: `Node ${node.id} failed: ${result.error}`,
        };
      }

      if (result.output) {
        context.nodeOutputs[node.id] = result.output;
        flowChainNode.output = result.output;
      }

      flowChainNode.state = 'completed';
      context.execution.flow_chain?.push(flowChainNode);

      context.execution.progress = Math.round((visited.size / nodes.length) * 100);

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
      const endResult = await ExecutorFactory.execute('end', endNode, context);
      
      if (!endResult.success) {
        return { 
          success: false, 
          error: `End node failed: ${endResult.error}`,
        };
      }

      return {
        success: true,
        output_data: endResult.output?.outputs || {},
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
