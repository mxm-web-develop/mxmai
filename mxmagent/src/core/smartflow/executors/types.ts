/**
 * 执行器通用类型定义
 */

/**
 * 执行上下文
 */
export interface ExecutionContext {
  input: Record<string, any>;              // 用户输入（从 start 节点的 input 处理而来）
  input_types?: Record<string, any[]>;     // 按类型分组的输入（从 start 节点）
  expected_outputs?: Array<{               // 预期输出（从 start 节点）
    type: 'text' | 'image' | 'video' | 'sound' | 'embedding';
    name: string;
    required: boolean;
  }>;
  nodeOutputs: Record<string, any>;       // 所有节点的输出 { nodeId: output }
  flowChain: Array<{                      // 执行链
    node_id: string;
    node_name: string;
    state: 'pending' | 'processing' | 'completed' | 'failed';
    input?: any;
    output?: any;
    error?: string;
    timestamp: number;
    duration?: number;
  }>;
  token?: string;                         // 用户认证 token（用于调用 mxmcgi）
  nodeMap?: Map<string, any>;            // 节点映射（用于 loop 节点）
  executeNode?: (node: any, context: ExecutionContext) => Promise<NodeExecutionResult>;  // 节点执行函数（用于 loop 节点）
  [key: string]: any;                     // 扩展字段
}

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
  success: boolean;
  output?: any;                           // 节点输出
  error?: string;                         // 错误信息
  metadata?: Record<string, any>;         // 元数据（如耗时、token 数等）
  nextNodes?: string[];                   // 下一个要执行的节点 ID（用于条件节点路由）
  isProcessing?: boolean;                 // 是否仍在处理中（用于异步任务，如图片/视频生成）
}

/**
 * 变量解析器接口
 */
export interface VariableResolver {
  resolve(expression: string, context: ExecutionContext): any;
}

/**
 * 基础节点执行器接口
 */
export interface NodeExecutor {
  execute(
    node: any,                            // SmartflowNode
    context: ExecutionContext
  ): Promise<NodeExecutionResult>;
}
