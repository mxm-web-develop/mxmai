/**
 * Smartflow 核心类型定义
 */

// ============= 节点类型 =============
export type NodeType =
  | 'start'            // 开始节点
  | 'business'         // 业务节点（统一调用 v2 /api/v2/tasks 动态业务）
  | 'tools'            // 工具节点
  | 'variable'         // 变量节点
  | 'condition'        // 条件节点
  | 'loop'             // 循环节点
  | 'end';             // 结束节点

// ============= 业务 Scope 类型 =============
// scope 由 mxmcgi 管理员在数据库定义，business 节点通过 v2 接口动态获取可用业务
export type BusinessScope = 'writing' | 'graph' | 'audio' | 'video' | 'character' | 'knowledge';

// ============= 工具类型 =============
export type ToolType = 'web_search' | 'web_scraper' | 'http_request' | 'embedding' | 'code_executor' | 'custom';

// ============= Smartflow 节点 =============
export interface SmartflowNode {
  id: string;
  type: NodeType;
  name?: string;

  // Start 节点配置
  input?: Array<{
    content: any;
    type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'json' | 'url' | 'other';
    name?: string;
  }>;
  trigger_words?: string[];
  expected_outputs?: Array<{
    type: 'text' | 'image' | 'video' | 'sound' | 'embedding';
    name: string;
    required: boolean;
  }>;
  smartflow_name?: string;

  // Business 节点配置（v2 动态业务架构）
  // scope: 业务大类，由 mxmcgi 定义（writing/graph/audio/video 等）
  // taskKey: 具体业务标识，由 admin 在数据库创建（如 outlines、voice-scripts 等）
  // subtype: 细分类型（可选，如 tech-article、news 等）
  // params: 动态参数，由 getTaskFormConfig 返回的 schema 定义
  business_scope?: BusinessScope;
  taskKey?: string;
  subtype?: string | null;
  params?: Record<string, any>;

  // Tools 节点配置
  tool_type?: ToolType;
  tool_params?: Record<string, any>;
  custom_code?: string;
  custom_language?: 'python' | 'javascript';
  custom_nl_prompt?: string;

  // Condition 节点配置
  if?: string;
  then?: string;
  else_if?: Array<{
    condition: string;
    then: string;
  }>;
  else?: string;

  // Variable 节点配置
  operation?: 'select' | 'map' | 'filter' | 'reduce' | 'merge' | 'assign';
  source_node?: string;
  source_path?: string;
  output_name?: string;
  default_value?: any;
  description?: string;

  // Loop 节点配置
  loop_mode?: 'iteration' | 'loop';
  iterable?: string;
  condition?: string;
  item_variable?: string;
  index_variable?: string;
  loop_nodes?: string[];
  max_iterations?: number;
  collect_output?: boolean;
  output_variable?: string;
  break_condition?: string;
  initial_value?: any;

  // End 节点配置
  output_mapping?: Record<string, string>;
  nullable_outputs?: string[];
  validate_outputs?: boolean;

  // 扩展配置
  options?: Record<string, any>;
  position?: { x: number; y: number };
}

// ============= Smartflow 边 =============
export interface SmartflowEdge {
  from: string;
  to: string;
  when?: string;
  id?: string;
  type?: 'default' | 'conditional';
}

// ============= Smartflow Schema =============
export interface SmartflowSchema {
  nodes: SmartflowNode[];
  edges: SmartflowEdge[];
  version?: string;
  variables?: Record<string, any>;
  settings?: {
    timeout?: number;
    retry_count?: number;
    error_handling?: 'stop' | 'continue' | 'retry';
  };
}

// ============= Smartflow 定义 =============
export interface Smartflow {
  id: string;
  name: string;
  schema: SmartflowSchema;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';
  version?: string;
  author_id?: string;
  is_public?: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

// ============= 执行状态 =============
export type SmartflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ============= 节点执行状态 =============
export type NodeExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ============= 执行链节点 =============
export interface FlowChainNode {
  node_id: string;
  node_name: string;
  node_type: NodeType;
  state: NodeExecutionStatus;
  input?: any;
  output?: any;
  error?: string;
  timestamp: number;
  duration?: number;
}

// ============= Smartflow 执行实例 =============
export interface SmartflowExecution {
  id: string;
  smartflow_id: string;
  conversation_id?: string;
  user_id: string;
  status: SmartflowExecutionStatus;
  progress: number;
  input_data: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  flow_chain?: FlowChainNode[];
  started_at?: Date | string;
  completed_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

// ============= DTOs =============
export interface CreateSmartflowDto {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  schema: SmartflowSchema;
  status?: 'active' | 'inactive' | 'draft';
  version?: string;
  author_id?: string;
  is_public?: boolean;
}

export interface UpdateSmartflowDto {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  schema?: SmartflowSchema;
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';
  version?: string;
}

export interface CreateExecutionDto {
  smartflow_id: string;
  conversation_id?: string;
  user_id: string;
  input_data: Record<string, any>;
  mode?: 'test' | 'run';
  verbose?: boolean;
}

// ============= 节点执行上下文 =============
export interface ExecutionContext {
  execution: SmartflowExecution;
  smartflow: Smartflow;
  nodeOutputs: Record<string, any>;
  variables: Record<string, any>;
}

// ============= Business 节点 v2 接口相关类型 =============

/** GET /api/v2/tasks/form-config/list 返回的单个业务项 */
export interface BusinessTaskListItem {
  taskKey: string;
  name?: string;
  subtypes?: string[];
}

/** GET /api/v2/tasks/form-config 返回的表单配置 */
export interface BusinessFormConfig {
  scope: string;
  taskKey: string;
  subtype?: string | null;
  schema?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
  uiSchema?: Record<string, any> | null;
}
