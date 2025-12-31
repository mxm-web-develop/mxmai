/**
 * Smartflow 数据模型
 * 参考 Dify.ai 的 Workflow 概念
 */

/**
 * 工作流节点类型
 */
export type NodeType = 
  | 'start'            // 开始节点（设置全局参数、触发词、预期输出）
  | 'model'            // 模型节点（替代 llm，支持 text/image/video/sound/embedding）
  | 'tools'            // 工具节点（统一执行器，支持内置和用户自定义工具）
  | 'formatter'        // 格式化节点（Prompt 模板 + 格式转换，基于 text 模型）
  | 'recall'           // 召回节点（从知识库召回内容，支持内置和用户扩展）
  | 'condition'        // 条件节点（支持 if/else if/else）
  | 'loop'             // 循环节点（对数组进行迭代处理）
  | 'end';             // 结束节点（验证输出，支持多资源输出）

/**
 * 模型类型枚举
 */
export type ModelType = 
  | 'text'       // 文本生成
  | 'image'      // 图片生成
  | 'video'      // 视频生成
  | 'sound'      // 音频生成
  | 'embedding'; // 向量生成

/**
 * 工作流节点配置（简化版，用户友好）
 * 
 * 设计原则：
 * 1. 扁平化配置，减少嵌套
 * 2. 常用字段直接配置，不常用字段放在 options 中
 * 3. 自动推断输入输出，减少配置量
 */
export interface SmartflowNode {
  id: string;                    // 节点唯一标识（必需）
  type: NodeType;                // 节点类型（必需）
  name?: string;                 // 节点名称（可选，用于显示）
  
  // ========== Start 节点配置 ==========
  input?: Array<{                       // 用户输入参数（Start 节点）
    content: any;                        // 输入内容（文字、文件等）
    type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'json' | 'url' | 'other';  // 输入类型
    name?: string;                       // 输入名称（可选，用于引用）
  }>;
  trigger_words?: string[];              // 触发词（Start 节点）
  expected_outputs?: Array<{            // 预期输出文件（Start 节点）
    type: 'text' | 'image' | 'video' | 'sound' | 'embedding';
    name: string;                        // 输出名称，如 "main_text", "cover_image"
    required: boolean;                   // 是否必需
  }>;
  smartflow_name?: string;               // Smartflow 链的名字（Start 节点）
  
  // ========== Model 节点配置 ==========
  model_type?: ModelType;                // 模型类型（Model 节点必需）
  model?: string;                        // 具体模型名称（Model 节点必需，从 mxmcgi 支持的模型中选择）
  prompt?: string;                       // 提示词（Model 节点必需）
  params?: Record<string, any>;         // 模型特定参数（Model 节点可选，如 temperature, aspect_ratio 等）
  
  // ========== Tools 节点配置 ==========
  tool_type?: 'web_search' | 'web_scraper' | 'http_request' | 'custom';  // 工具类型（Tools 节点必需）
  tool_params?: Record<string, any>;     // 工具参数（Tools 节点必需）
  custom_code?: string;                  // 用户提供的代码（Tools 节点，tool_type='custom' 时使用）
  custom_language?: 'python' | 'javascript';  // 代码语言（Tools 节点）
  custom_nl_prompt?: string;             // 自然语言描述（Tools 节点，AI 生成代码，后期支持）
  
  // ========== Formatter 节点配置 ==========
  template?: string;                     // Prompt 模板名称或自定义模板内容（Formatter 节点）
  format_prompt?: string;                 // 格式化提示词（Formatter 节点必需）
  reference_nodes?: string[];            // 参考节点 ID 列表（Formatter 节点）
  output_format?: 'json' | 'text' | 'markdown' | 'html' | 'prompt';  // 输出格式（Formatter 节点）
  formatter_model?: string;               // 使用的模型（Formatter 节点可选，默认使用快速模型）
  
  // ========== Recall 节点配置 ==========
  knowledge_base?: string;               // 知识库名称（Recall 节点必需）
  query?: string;                        // 查询内容（Recall 节点必需，可以是文本或变量引用）
  recall_params?: {                     // 检索参数（Recall 节点可选）
    top_k?: number;                      // 返回 top K 个结果，默认 5
    similarity_threshold?: number;       // 相似度阈值，默认 0.7
    search_type?: 'vector' | 'keyword' | 'hybrid';  // 检索类型，默认 'hybrid'
  };
  
  // ========== Condition 节点配置 ==========
  if?: string;                           // if 条件表达式（Condition 节点必需）
  then?: string;                         // 条件为真时的目标节点 ID（Condition 节点必需）
  else_if?: Array<{                      // else if 条件（Condition 节点可选，支持多个）
    condition: string;                   // 条件表达式
    then: string;                        // 目标节点 ID
  }>;
  else?: string;                         // else 分支（Condition 节点必需）
  
  // ========== Loop 节点配置 ==========
  iterable?: string;                     // 要循环的数组表达式（Loop 节点必需，如 "{{node.output.items}}"）
  item_variable?: string;                // 每次循环中，当前项存储的变量名（Loop 节点必需，如 "item"）
  index_variable?: string;                // 循环索引变量名（Loop 节点可选，如 "index"）
  loop_nodes?: string[];                 // 要循环执行的节点 ID 列表（Loop 节点必需）
  max_iterations?: number;               // 最大循环次数（Loop 节点可选，默认 100，防止无限循环）
  collect_output?: boolean;              // 是否收集循环中所有节点的输出（Loop 节点可选，默认 true）
  output_variable?: string;               // 收集的输出存储的变量名（Loop 节点可选，默认 "collected_outputs"）
  break_condition?: string;               // 跳出循环的条件表达式（Loop 节点可选，如 "{{item.should_break}}"）
  
  // ========== End 节点配置 ==========
  output_mapping?: Record<string, string>;  // 输出映射（End 节点），如 { "main_text": "model1.response" }
  nullable_outputs?: string[];            // 允许置空的输出名称列表（End 节点）
  validate_outputs?: boolean;            // 是否验证输出（End 节点，默认 true）
  
  // 高级配置（可选，放在 options 中）
  options?: {                            // 不常用配置
    [key: string]: any;
  };
  
  // 可视化相关（可选，仅用于可视化编辑器）
  position?: {                           // 节点在画布上的位置
    x: number;
    y: number;
  };
  
  // 扩展字段
  [key: string]: any;                    // 支持扩展配置
}

/**
 * 工作流边（连接，简化版）
 * 
 * 设计原则：
 * 1. 使用 from/to 而非 source/target（更直观）
 * 2. 大部分情况下不需要条件，保持简单
 * 3. 条件使用 when 而非 condition（更清晰）
 */
export interface SmartflowEdge {
  from: string;                  // 源节点 ID（必需）
  to: string;                    // 目标节点 ID（必需）
  when?: string;                // 条件表达式（可选，用于条件分支）
  
  // 扩展字段（可选，用于可视化编辑器）
  id?: string;                   // 边唯一标识（可选，自动生成）
  type?: 'default' | 'conditional'; // 边类型（可选，自动推断）
  
  [key: string]: any;            // 支持扩展配置
}

/**
 * 工作流定义（Schema，简化版）
 * 
 * 设计原则：
 * 1. 最小化必需字段
 * 2. 可选字段有合理的默认值
 * 3. 配置简单直观
 */
export interface SmartflowSchema {
  nodes: SmartflowNode[];        // 节点列表（必需）
  edges: SmartflowEdge[];        // 边列表（必需）
  
  // 可选配置
  version?: string;              // Schema 版本（可选，默认 '1.0.0'）
  variables?: Record<string, any>; // 全局变量（可选）
  settings?: {                   // 工作流设置（可选）
    timeout?: number;            // 超时时间（秒，可选）
    retry_count?: number;        // 重试次数（可选，默认 0）
    error_handling?: 'stop' | 'continue' | 'retry'; // 错误处理策略（可选，默认 'stop'）
  };
  
  [key: string]: any;            // 支持扩展配置
}

/**
 * Smartflow 定义（模板，简化版）
 * 
 * 设计原则：
 * 1. 必需字段最少
 * 2. 可选字段有默认值
 * 3. 配置简单直观
 */
export interface Smartflow {
  id: string;                    // 工作流 ID（必需，如 'testflow', 'image_generation'）
  name: string;                  // 工作流名称（必需）
  schema: SmartflowSchema;       // 工作流定义（必需）
  
  // 可选元数据
  description?: string;          // 工作流描述（可选）
  category?: string;             // 分类（可选）
  icon?: string;                 // 图标 URL（可选）
  tags?: string[];               // 标签（可选）
  status?: 'active' | 'inactive' | 'draft' | 'deprecated'; // 状态（可选，默认 'draft'）
  version?: string;               // 版本号（可选，默认 '1.0.0'）
  author_id?: string;            // 创建者 ID（可选）
  is_public?: boolean;          // 是否公开（可选，默认 false）
  
  // 时间戳
  created_at?: Date | string;    // 创建时间（可选，自动生成）
  updated_at?: Date | string;    // 更新时间（可选，自动生成）
  
  [key: string]: any;            // 支持扩展字段
}

/**
 * Smartflow 执行实例状态
 */
export type SmartflowExecutionStatus = 
  | 'pending'      // 等待执行
  | 'running'      // 执行中
  | 'completed'   // 已完成
  | 'failed'       // 执行失败
  | 'cancelled';   // 已取消

/**
 * Smartflow 执行实例
 */
export interface SmartflowExecution {
  id: string;                    // 执行实例 ID（task_id）
  smartflow_id: string;          // 工作流 ID
  conversation_id?: string;      // 关联的对话 ID（如果从对话触发）
  user_id: string;               // 用户 ID
  status: SmartflowExecutionStatus; // 执行状态
  progress: number;              // 进度（0-100）
  input_data: Record<string, any>; // 输入数据
  output_data?: Record<string, any>; // 输出数据
  error_message?: string;        // 错误信息
  flow_chain?: Array<{            // 执行链（思维链）
    node_id: string;              // 节点 ID
    node_name: string;            // 节点名称
    state: 'pending' | 'processing' | 'completed' | 'failed';
    input?: any;                  // 节点输入
    output?: any;                 // 节点输出
    error?: string;              // 节点错误
    timestamp: number;           // 时间戳
    duration?: number;           // 执行时长（毫秒）
  }>;
  started_at?: Date | string;    // 开始时间
  completed_at?: Date | string;  // 完成时间
  created_at: Date | string;
  updated_at: Date | string;
  [key: string]: any;
}

/**
 * 创建 Smartflow DTO
 */
export interface CreateSmartflowDto {
  id?: string;                   // 如果不提供，自动生成
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
  [key: string]: any;
}

/**
 * 更新 Smartflow DTO
 */
export interface UpdateSmartflowDto {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  schema?: SmartflowSchema;
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';
  version?: string;
  [key: string]: any;
}

/**
 * 创建 Smartflow 执行实例 DTO
 */
export interface CreateSmartflowExecutionDto {
  smartflow_id: string;
  conversation_id?: string;
  user_id: string;
  input_data: Record<string, any>;
  [key: string]: any;
}
