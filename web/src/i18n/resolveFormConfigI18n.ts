import type { TaskFormConfig } from '../api/client';
import {
  type AppLocale,
  normalizeAppLocale,
  pickDisplayLocalizedString,
  pickLocalizedString,
} from './appLocale';

/** @deprecated 使用 AppLocale；保留别名兼容旧导入 */
export type AppLang = AppLocale;

export function toAppLang(lng: string | undefined): AppLang {
  return normalizeAppLocale(lng);
}

function walkSchemaTitles(
  schema: Record<string, unknown> | undefined,
  formOptionsI18n: Record<string, unknown> | undefined,
  lang: AppLang,
  schemaDefaults: Record<string, Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== 'object') return schema;
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return schema;

  const nextProps: Record<string, Record<string, unknown>> = {};
  for (const [key, field] of Object.entries(props)) {
    const fieldI18n = formOptionsI18n?.[key] as Record<string, string> | undefined;
    const primaryTitle =
      typeof field.title === 'string'
        ? field.title
        : typeof schemaDefaults?.[key]?.title === 'string'
          ? String(schemaDefaults[key].title)
          : undefined;
    const title = pickDisplayLocalizedString(primaryTitle, fieldI18n, lang);
    nextProps[key] = title ? { ...field, title } : field;
  }
  return { ...schema, properties: nextProps };
}

/** 按当前语言解析 form-config 中的可本地化字段 */
export function resolveFormConfigI18n(
  config: TaskFormConfig | null | undefined,
  lang: AppLang
): TaskFormConfig | null | undefined {
  if (!config) return config;

  const formOptionsI18n = config.form_options_i18n as Record<string, unknown> | undefined;
  const taskLabel = pickDisplayLocalizedString(
    config.taskLabel,
    config.taskLabelI18n as Record<string, string> | undefined,
    lang
  );
  const subtypeLabel = pickDisplayLocalizedString(
    config.subtypeLabel,
    config.subtypeLabelI18n as Record<string, string> | undefined,
    lang
  );

  const schema = walkSchemaTitles(
    config.schema as Record<string, unknown> | undefined,
    formOptionsI18n,
    lang,
    undefined
  );

  if (import.meta.env.DEV && lang !== 'zh' && formOptionsI18n) {
    const missing = Object.entries(formOptionsI18n).filter(([, v]) => {
      const map = v as Record<string, string>;
      return !pickLocalizedString(map, lang);
    });
    if (missing.length > 0) {
      console.debug(
        `[i18n] form_options_i18n missing ${lang}:`,
        missing.map(([k]) => k)
      );
    }
  }

  return {
    ...config,
    schema: schema ?? config.schema,
    taskLabel: taskLabel || config.taskLabel,
    subtypeLabel: subtypeLabel || config.subtypeLabel,
  };
}
