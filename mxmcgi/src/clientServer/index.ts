/**
 * 客户端表单配置聚合
 * 供 routes 的 getformOptions 等接口使用
 */

export { getFormOptionsForType } from './graph';
export type { FormOption, FormOptionsConfig, FieldMetadata } from './shared/formOptions';
export { isSelectField, getFieldMetadata, getFieldType } from './shared/formOptions';
export { getVideoFormOptions } from './video/formOptions';
export type { VideoFormOption, VideoFormOptionsConfig } from './video/formOptions';
