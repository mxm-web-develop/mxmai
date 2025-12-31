/**
 * 工具执行器规范
 * 所有工具（内置和用户自定义）必须遵循此接口
 */

/**
 * 工具执行上下文
 */
export interface ToolContext {
  input: Record<string, any>;              // 用户输入（从 start 节点的 input 获取）
  nodeOutputs: Record<string, any>;      // 上游节点输出
  [key: string]: any;                     // 扩展字段
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: any;                             // 工具输出数据
  error?: string;                         // 错误信息
  metadata?: Record<string, any>;        // 元数据（如耗时、来源等）
}

/**
 * 工具函数签名规范
 * 所有工具必须遵循此接口
 */
export type ToolFunction = (
  params: Record<string, any>,
  context?: ToolContext
) => Promise<ToolResult>;

/**
 * 工具注册信息
 */
export interface ToolInfo {
  name: string;                           // 工具名称
  displayName: string;                    // 显示名称
  description: string;                    // 工具描述
  function: ToolFunction;                 // 工具函数
  paramsSchema?: Record<string, any>;    // 参数 JSON Schema（可选）
}
