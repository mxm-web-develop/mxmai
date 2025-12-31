/**
 * Prompt 模板数据模型
 */

/**
 * Prompt 模板
 */
export interface PromptTemplate {
  id: string;                      // 模板 ID
  name: string;                    // 模板名称（唯一）
  display_name: string;            // 显示名称
  description?: string;            // 模板描述
  template: string;                 // 模板内容（支持变量占位符 {{variable}}）
  variables: string[];              // 模板变量列表
  category?: string;               // 分类（如 'image', 'text', 'formatter'）
  author_id?: string;              // 创建者 ID
  is_public: boolean;             // 是否公开
  usage_count: number;             // 使用次数
  created_at?: Date | string;      // 创建时间
  updated_at?: Date | string;      // 更新时间
}

/**
 * 创建 Prompt 模板 DTO
 */
export interface CreatePromptTemplateDto {
  id?: string;                     // 如果不提供，自动生成
  name: string;                    // 模板名称（必需，唯一）
  display_name: string;            // 显示名称（必需）
  description?: string;            // 模板描述
  template: string;                 // 模板内容（必需）
  variables?: string[];            // 模板变量列表
  category?: string;               // 分类
  author_id?: string;              // 创建者 ID
  is_public?: boolean;             // 是否公开，默认 false
  [key: string]: any;
}

/**
 * 更新 Prompt 模板 DTO
 */
export interface UpdatePromptTemplateDto {
  display_name?: string;           // 显示名称
  description?: string;            // 模板描述
  template?: string;                // 模板内容
  variables?: string[];            // 模板变量列表
  category?: string;              // 分类
  is_public?: boolean;            // 是否公开
  [key: string]: any;
}
