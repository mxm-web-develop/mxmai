/**
 * 统一的表单选项接口定义
 * 所有类型的 formOptions 都使用这个接口
 */

export interface FormOption {
  value: string;
  label: string;
  labelEn?: string; // 英文标签（可选）
}

/**
 * 表单选项配置接口（支持动态字段）
 * 不同业务类型有不同的参数字段
 */
export interface FormOptionsConfig {
  [key: string]: FormOption[];
}
