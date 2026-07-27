/**
 * Smartflow 核心类型定义
 */

// ============= 节点类型 =============
export type NodeType =
  | 'start'            // 开始节点
  | 'business'         // 业务节点（统一调用 v2 /api/v2/tasks 动态业务）
  | 'model'            // 模型节点（AI 模型生成 text/image/video/sound/embedding）
  | 'tools'            // 工具节点
  | 'variable'         // 变量节点
  | 'condition'        // 条件节点
  | 'loop'             // 循环节点
  | 'plan_execute'     // 复合：Plan-and-Execute
  | 'reflection'       // 复合：Generate → Critique → Revise
  | 'react'            // 复合：ReAct 工具环
  | 'research'         // 复合：调研摘要（think + deep_search + summarize）
  | 'end';             // 结束节点

// ============= Loop iteration =============
export type LoopIterationErrorPolicy = 'skip' | 'fail_fast' | 'collect_errors';

export interface LoopIterationResultRow {
  index: number;
  success: boolean;
  taskId?: string;
  /** 生图/音视频等业务完成后的资源 URL */
  mediaUrls?: string[];
  error?: string;
  output?: unknown;
}

// ============= 业务 Scope 类型 =============
// scope 由 mxmcgi 管理员在数据库定义，business 节点通过 v2 接口动态获取可用业务
export type BusinessScope = 'writing' | 'outline' | 'text' | 'graph' | 'audio' | 'video' | 'character' | 'knowledge';

// ============= 工具类型 =============
export type ToolType =
  | 'web_search'
  | 'web_scraper'
  | 'deep_search'
  | 'code_executor'
  | 'vector_store'
  | 'vector_recall'
  // legacy / advanced
  | 'http_request'
  | 'embedding'
  | 'multi_dimension_search'
  | 'domain_search'
  | 'legal_search'
  | 'stock_lookup'
  | 'crypto_lookup'
  | 'company_lookup'
  | 'custom';

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
  /** 与 Task V2 一致的 JSON Schema，用于运行页动态表单与 Open API 入参文档 */
  formSchema?: Record<string, unknown>;
  uiSchema?: Record<string, unknown>;
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
  operation?: 'select' | 'map' | 'filter' | 'reduce' | 'merge' | 'assign' | 'json_parse';
  source_node?: string;
  source_path?: string;
  output_name?: string;
  default_value?: any;
  description?: string;
  /** map 时从上下文解析规划结果数组，注入 planTasks 参数 */
  plan_tasks_from?: string;

  // Loop 节点配置
  loop_mode?: 'iteration' | 'loop';
  iterable?: string;
  condition?: string;
  item_variable?: string;
  index_variable?: string;
  loop_nodes?: string[];
  max_iterations?: number;
  /** iteration 模式下并行执行各轮（默认 false 保持串行） */
  parallel_iterations?: boolean;
  /** 并行迭代最大并发（默认 3） */
  max_concurrency?: number;
  /** iteration 失败策略（默认 collect_errors） */
  on_iteration_error?: LoopIterationErrorPolicy;
  collect_output?: boolean;
  output_variable?: string;
  break_condition?: string;
  initial_value?: any;

  // End 节点配置
  output_mapping?: Record<string, string>;
  nullable_outputs?: string[];
  validate_outputs?: boolean;

  // Model 节点配置（text/image/video/sound/embedding 生成）
  model_type?: 'text' | 'image' | 'video' | 'sound' | 'embedding';
  model?: string;
  prompt?: string;
  model_params?: Record<string, any>;

  // 复合节点：各模式配置（与 composite-types 对齐）
  goal?: string;
  task?: string;
  artifact?: string;
  context?: string;
  topic?: string;
  max_rounds?: number;
  max_steps?: number;
  max_replans?: number;
  pass_pattern?: string;
  replan_on_failure?: boolean;
  planner?: Record<string, any>;
  executor?: Record<string, any>;
  replanner?: Record<string, any>;
  generator?: Record<string, any>;
  critic?: Record<string, any>;
  reviser?: Record<string, any>;
  query_generator?: Record<string, any>;
  tools?: ToolType[];
  system_prompt?: string;
  search_depth?: string;
  summarizer_model?: string;

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
  | 'paused'
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
