/**
 * 统一的表单选项接口定义
 * 用于 Graph 和 Writing 系统，保持格式一致
 */

/**
 * 表单选项（用于 select 类型）
 */
export interface FormOption {
  value: string;
  label: string;
  labelEn?: string; // 英文标签（可选）
}

/**
 * 字段元数据（扩展信息，用于非 select 类型字段）
 */
export interface FieldMetadata {
  type: 'select' | 'multi-select' | 'text' | 'textarea' | 'number';
  label: string;
  labelEn?: string;
  placeholder?: string;
  placeholderEn?: string;
  required?: boolean;
  helpText?: string;
  helpTextEn?: string;
  min?: number;  // 用于 number 类型
  max?: number;  // 用于 number 类型
}

/**
 * 统一的表单选项配置
 * 
 * 兼容两种格式：
 * 1. 简单格式（Graph 当前使用）：{ fieldName: FormOption[] }
 * 2. 扩展格式（Writing 使用）：{ fieldName: FormOption[], _metadata?: { fieldName: FieldMetadata } }
 */
export interface FormOptionsConfig {
  // 字段选项（select 类型直接是数组，其他类型为空数组或 undefined）
  [key: string]: FormOption[] | FieldMetadata | undefined | {
    [fieldName: string]: FieldMetadata;
  };
  
  // 元数据（可选，用于非 select 类型字段）
  _metadata?: {
    [fieldName: string]: FieldMetadata;
  };
}

/**
 * 检查字段是否为 select 类型（兼容 Graph 的简单格式）
 * @param config 表单选项配置
 * @param fieldName 字段名
 * @returns 如果是 select 类型返回 true
 */
export function isSelectField(
  config: FormOptionsConfig,
  fieldName: string
): boolean {
  const value = config[fieldName];
  return Array.isArray(value) && value.length > 0;
}

/**
 * 获取字段元数据
 * @param config 表单选项配置
 * @param fieldName 字段名
 * @returns 字段元数据，如果不存在则返回 null
 */
export function getFieldMetadata(
  config: FormOptionsConfig,
  fieldName: string
): FieldMetadata | null {
  // 优先从 _metadata 获取
  if (config._metadata && config._metadata[fieldName]) {
    return config._metadata[fieldName];
  }
  
  // 如果是 select 类型，从选项数组推断
  if (isSelectField(config, fieldName)) {
    return {
      type: 'select',
      label: fieldName, // 默认使用字段名
    };
  }
  
  return null;
}

/**
 * 获取字段类型
 * @param config 表单选项配置
 * @param fieldName 字段名
 * @returns 字段类型
 */
export function getFieldType(
  config: FormOptionsConfig,
  fieldName: string
): 'select' | 'multi-select' | 'text' | 'textarea' | 'number' {
  const metadata = getFieldMetadata(config, fieldName);
  if (metadata) {
    return metadata.type;
  }
  
  // 默认：如果有选项数组，则是 select
  if (isSelectField(config, fieldName)) {
    return 'select';
  }
  
  // 默认类型
  return 'text';
}
