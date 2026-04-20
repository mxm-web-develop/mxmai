import { SchemaForm, type SchemaFormValue } from '../components/SchemaForm';
import type { TaskFormConfig } from '../api/client';

type Props = {
  formConfig: TaskFormConfig | null;
  formValues: SchemaFormValue;
  onChange: (next: SchemaFormValue) => void;
  /** 列表或 form-config 加载中 */
  loading?: boolean;
  loadingMessage?: string;
  /**
   * `default`：跟随页面与 `html.dark`。
   * `panel`：用于深色抽屉/侧栏内嵌表单（强制浅色标签与深色输入框）。
   */
  surface?: 'default' | 'panel';
};

/**
 * 仅负责：按 Admin `form-config` 渲染 `SchemaForm`；业务选择（taskKey/subtype）由页面另写。
 */
export function TaskV2SchemaForm({
  formConfig,
  formValues,
  onChange,
  loading,
  loadingMessage = '加载表单配置…',
  surface = 'default',
}: Props) {
  const variant = surface === 'panel' ? 'panel' : 'default';
  if (loading || !formConfig?.schema) {
    return (
      <p
        className="task-v2-schema-form__loading"
        style={{
          margin: 0,
          fontSize: 13,
          color: variant === 'panel' ? 'rgba(148, 163, 184, 0.95)' : 'var(--text-muted, #64748b)',
        }}
      >
        {loadingMessage}
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <SchemaForm
        schema={formConfig.schema}
        uiSchema={formConfig.uiSchema ?? undefined}
        value={formValues}
        onChange={onChange}
        hydrateDefaults
        variant={variant}
      />
    </div>
  );
}
