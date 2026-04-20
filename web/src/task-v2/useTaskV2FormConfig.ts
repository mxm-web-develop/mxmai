import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTaskFormConfig,
  getTaskFormConfigList,
  type TaskFormConfig,
  type TaskFormConfigListItem,
} from '../api/client';
import type { SchemaFormValue } from '../components/SchemaForm';
import { buildDefaultsFromSchema, type BuildDefaultsOptions } from './buildDefaultsFromSchema';

/** 与 mxmcgi `TaskScope` 对齐 */
export type TaskV2Scope = 'outline' | 'writing' | 'graph' | 'audio' | 'music' | 'video' | 'text';

export type UseTaskV2FormConfigOptions = {
  scope: TaskV2Scope;
  /** 未登录等场景可置 false，不请求 */
  enabled?: boolean;
  /**
   * 拉取 form-config/list 后：若当前 taskKey/subtype 不在列表中，是否自动改为第一项
   * @default true
   */
  syncSelectionToList?: boolean;
  initialTaskKey?: string;
  initialSubtype?: string | null;
  /** 传给 buildDefaultsFromSchema（如 outline 用 `outline_${Date.now()}`） */
  buildDefaultsOptions?: BuildDefaultsOptions;
};

export type UseTaskV2FormConfigResult = {
  taskKey: string;
  setTaskKey: React.Dispatch<React.SetStateAction<string>>;
  subtype: string | null;
  setSubtype: React.Dispatch<React.SetStateAction<string | null>>;
  /** 切换业务行时先清空，待 form-config 返回后由内部 effect 写入 default */
  clearPendingForm: () => void;
  taskOptions: TaskFormConfigListItem[];
  listLoading: boolean;
  formConfig: TaskFormConfig | null;
  configLoading: boolean;
  formValues: SchemaFormValue;
  setFormValues: React.Dispatch<React.SetStateAction<SchemaFormValue>>;
  /** 按当前 formConfig.schema 重新填充 default */
  resetFormValues: () => void;
};

/**
 * Task v2 通用：拉取 form-config/list + form-config，维护 taskKey/subtype 与表单值。
 * 页面只需渲染业务选择 + `SchemaForm`（或 `TaskV2SchemaForm`），提交时用 `formValues`。
 */
export function useTaskV2FormConfig(options: UseTaskV2FormConfigOptions): UseTaskV2FormConfigResult {
  const {
    scope,
    enabled = true,
    syncSelectionToList = true,
    initialTaskKey = 'default',
    initialSubtype = null,
    buildDefaultsOptions,
  } = options;

  const defaultsOptsRef = useRef(buildDefaultsOptions);
  defaultsOptsRef.current = buildDefaultsOptions;

  const [taskKey, setTaskKey] = useState(initialTaskKey);
  const [subtype, setSubtype] = useState<string | null>(initialSubtype);
  const [taskOptions, setTaskOptions] = useState<TaskFormConfigListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [formConfig, setFormConfig] = useState<TaskFormConfig | null>(null);
  const [formValues, setFormValues] = useState<SchemaFormValue>({});
  const [configLoading, setConfigLoading] = useState(false);

  const clearPendingForm = useCallback(() => {
    setFormValues({});
  }, []);

  const resetFormValues = useCallback(() => {
    setFormValues(buildDefaultsFromSchema(formConfig?.schema ?? null, defaultsOptsRef.current));
  }, [formConfig]);

  // list
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      try {
        const res = await getTaskFormConfigList({ scope });
        const data =
          (res.data as { data?: { items: TaskFormConfigListItem[] } })?.data ??
          (res.data as { items?: TaskFormConfigListItem[] } | undefined);
        const items = Array.isArray(data?.items) ? data!.items! : [];
        if (cancelled) return;
        setTaskOptions(items);
      } catch {
        if (!cancelled) setTaskOptions([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, scope]);

  // 列表与当前选择对齐（与旧 Outline 行为一致）
  useEffect(() => {
    if (!enabled || !syncSelectionToList || taskOptions.length === 0) return;
    const exists = taskOptions.some(
      (x) => x.taskKey === taskKey && (x.subtype ?? null) === (subtype ?? null)
    );
    if (!exists) {
      setTaskKey(taskOptions[0].taskKey);
      setSubtype(taskOptions[0].subtype ?? null);
    }
  }, [enabled, syncSelectionToList, taskOptions, taskKey, subtype]);

  // form-config + 默认值
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      try {
        const res = await getTaskFormConfig({
          scope,
          taskKey: taskKey || 'default',
          ...(subtype ? { subtype } : {}),
        });
        const data =
          (res.data as { data?: TaskFormConfig })?.data ?? (res.data as TaskFormConfig | undefined);
        if (cancelled) return;
        if (data?.schema) {
          setFormConfig(data);
          setFormValues(buildDefaultsFromSchema(data.schema, defaultsOptsRef.current));
        } else {
          setFormConfig(null);
          setFormValues({});
        }
      } catch {
        if (!cancelled) {
          setFormConfig(null);
          setFormValues({});
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, scope, taskKey, subtype]);

  return {
    taskKey,
    setTaskKey,
    subtype,
    setSubtype,
    clearPendingForm,
    taskOptions,
    listLoading,
    formConfig,
    configLoading,
    formValues,
    setFormValues,
    resetFormValues,
  };
}
