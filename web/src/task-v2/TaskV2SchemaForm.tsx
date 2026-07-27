import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SchemaForm, type SchemaFormValue } from '../components/SchemaForm';
import type { TaskFormConfig } from '../api/client';
import { resolveFormConfigI18n, toAppLang } from '../i18n/resolveFormConfigI18n';
import { indicatesWarpGatesCreate } from '../components/writingCreateUx';

type Props = {
  formConfig: TaskFormConfig | null;
  formValues: SchemaFormValue;
  onChange: (next: SchemaFormValue) => void;
  /** 列表或 form-config 加载中 */
  loading?: boolean;
  loadingMessage?: string;
  /**
   * `default`：跟随页面与 `html.dark`。
   * `panel`：用于抽屉/侧栏内嵌表单，跟随全局亮色/暗色主题。
   */
  surface?: 'default' | 'panel';
  /**
   * 为 true 时：即使 createUx=warp-gates 也强制渲染长表单（仅排障用）
   */
  forceSchemaForm?: boolean;
};

/**
 * 仅负责：按 Admin `form-config` 渲染 `SchemaForm`；业务选择（taskKey/subtype）由页面另写。
 * createUx=warp-gates 时默认不渲染长表单（避免与分步引导重复）。
 */
export function TaskV2SchemaForm({
  formConfig,
  formValues,
  onChange,
  loading,
  loadingMessage,
  surface = 'panel',
  forceSchemaForm = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = toAppLang(i18n.language);
  const resolvedConfig = useMemo(
    () => resolveFormConfigI18n(formConfig, lang) ?? null,
    [formConfig, lang]
  );
  const loadingText = loadingMessage ?? t('form.loadingConfig');
  const variant = surface === 'panel' ? 'panel' : 'default';
  const blockLongForm =
    !forceSchemaForm &&
    indicatesWarpGatesCreate({
      createUx: resolvedConfig?.createUx,
      schema: resolvedConfig?.schema ?? null,
      createGuide: resolvedConfig?.createGuide,
    });

  if (loading || !resolvedConfig?.schema) {
    return <p className="task-v2-schema-form__loading">{loadingText}</p>;
  }
  if (blockLongForm) {
    return (
      <p className="task-v2-schema-form__loading" style={{ color: 'var(--text-muted, #64748b)' }}>
        本业务为分步引导创建，不展示长表单。
      </p>
    );
  }
  return (
    <div className="task-v2-schema-form">
      <SchemaForm
        schema={resolvedConfig.schema}
        uiSchema={resolvedConfig.uiSchema ?? undefined}
        value={formValues}
        onChange={onChange}
        hydrateDefaults
        variant={variant}
        hideMetadataLabel
      />
    </div>
  );
}
