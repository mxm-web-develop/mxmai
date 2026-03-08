/**
 * 统一表单选项类型与工具：从 clientServer 复导出，供 core（如 writing/wtconfigs）使用
 */
export type {
  FormOption,
  FormOptionsConfig,
  FieldMetadata,
} from '../../clientServer/shared/formOptions';
export {
  isSelectField,
  getFieldMetadata,
  getFieldType,
} from '../../clientServer/shared/formOptions';
