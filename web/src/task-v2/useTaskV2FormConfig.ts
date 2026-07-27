import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getTaskFormConfig,
  getTaskFormConfigList,
  type TaskFormConfig,
  type TaskFormConfigListItem,
} from '../api/client';
import type { SchemaFormValue } from '../components/SchemaForm';
import { resolveFormConfigI18n, toAppLang } from '../i18n/resolveFormConfigI18n';
import { buildDefaultsFromSchema, type BuildDefaultsOptions } from './buildDefaultsFromSchema';
import { buildDefaultTaskLabelFromSelection } from './taskLabelDefaults';

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
  /** 留空则等 list 返回后再用第一项拉 form-config，避免先发 GET …/taskKey=default 导致 404 */
  initialTaskKey?: string;
  initialSubtype?: string | null;
  /** 传给 buildDefaultsFromSchema（如 outline 用 `outline_${Date.now()}`） */
  buildDefaultsOptions?: BuildDefaultsOptions;
  /**
   * 创建抽屉/弹层是否打开。传入时：关闭期间不自动刷新默认任务名；每次打开会清除「已手改」标记并重新生成默认名。
   * 不传则始终根据当前 taskKey/subtype 同步默认名（适合表单常显的页）。
   */
  formDrawerOpen?: boolean;
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
  /** 列表展示用，写入 `params.metadata.label`（与 mxmcgi TaskManager / DB 一致） */
  taskLabel: string;
  onTaskLabelChange: (next: string) => void;
  /** 当前选择下的默认「子类型显示名-时间戳」 */
  computeDefaultTaskLabel: () => string;
  /** 合并 `metadata.label` 到提交 params（保留已有 metadata 其它键） */
  mergeTaskLabelIntoParams: (params: Record<string, unknown>) => Record<string, unknown>;
  /** 提交成功后调用：清除手改标记并刷新为新的默认名 */
  resetTaskLabelAfterSubmit: () => void;
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
    initialTaskKey = '',
    initialSubtype = null,
    buildDefaultsOptions,
    formDrawerOpen,
  } = options;

  const defaultsOptsRef = useRef(buildDefaultsOptions);
  defaultsOptsRef.current = buildDefaultsOptions;

  const [taskKey, setTaskKey] = useState(initialTaskKey);
  const [subtype, setSubtype] = useState<string | null>(initialSubtype);
  const [taskOptions, setTaskOptions] = useState<TaskFormConfigListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [formConfigRaw, setFormConfigRaw] = useState<TaskFormConfig | null>(null);
  const [formValues, setFormValues] = useState<SchemaFormValue>({});
  const [configLoading, setConfigLoading] = useState(false);

  const { i18n } = useTranslation();
  const lang = toAppLang(i18n.language);
  const formConfig = useMemo(
    () => resolveFormConfigI18n(formConfigRaw, lang) ?? null,
    [formConfigRaw, lang]
  );

  const [taskLabel, setTaskLabel] = useState('');
  const taskLabelDirtyRef = useRef(false);
  const prevFormDrawerOpenRef = useRef<boolean | undefined>(undefined);

  const computeDefaultTaskLabel = useCallback(() => {
    const opt = taskOptions.find((x) => x.taskKey === taskKey && (x.subtype ?? null) === (subtype ?? null));
    return buildDefaultTaskLabelFromSelection({
      subtypeLabel: (opt?.subtypeLabel ?? '').trim(),
      subtype,
      taskLabel: (opt?.taskLabel ?? '').trim(),
      taskKey,
    });
  }, [taskOptions, taskKey, subtype]);

  const onTaskLabelChange = useCallback((next: string) => {
    taskLabelDirtyRef.current = true;
    setTaskLabel(next);
  }, []);

  const mergeTaskLabelIntoParams = useCallback(
    (params: Record<string, unknown>) => {
      const name = (taskLabel.trim() || computeDefaultTaskLabel()).slice(0, 200);
      const prevMeta = params.metadata;
      const metaBase =
        prevMeta && typeof prevMeta === 'object' && !Array.isArray(prevMeta)
          ? { ...(prevMeta as Record<string, unknown>) }
          : {};
      return { ...params, metadata: { ...metaBase, label: name } };
    },
    [taskLabel, computeDefaultTaskLabel]
  );

  const resetTaskLabelAfterSubmit = useCallback(() => {
    taskLabelDirtyRef.current = false;
    setTaskLabel(computeDefaultTaskLabel());
  }, [computeDefaultTaskLabel]);

  const clearPendingForm = useCallback(() => {
    setFormValues({});
  }, []);

  const resetFormValues = useCallback(() => {
    setFormValues(buildDefaultsFromSchema(formConfigRaw?.schema ?? null, defaultsOptsRef.current));
  }, [formConfigRaw]);

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

  // form-config + 默认值（须已有 taskKey，避免 DB 无 default 行时刷 404）
  // 切换业务时立刻清空旧 config，避免下游用上一业务的 createGuide/schema 开引导
  useEffect(() => {
    if (!enabled || !(taskKey || '').trim()) return;
    let cancelled = false;
    setConfigLoading(true);
    setFormConfigRaw(null);
    setFormValues({});
    (async () => {
      try {
        const res = await getTaskFormConfig({
          scope,
          taskKey,
          ...(subtype ? { subtype } : {}),
        });
        const data =
          (res.data as { data?: TaskFormConfig })?.data ?? (res.data as TaskFormConfig | undefined);
        if (cancelled) return;
        if (data?.schema) {
          setFormConfigRaw(data);
          setFormValues(buildDefaultsFromSchema(data.schema, defaultsOptsRef.current));
        } else {
          setFormConfigRaw(null);
          setFormValues({});
        }
      } catch {
        if (!cancelled) {
          setFormConfigRaw(null);
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

  useEffect(() => {
    if (formDrawerOpen === undefined) return;
    const cur = !!formDrawerOpen;
    const was = prevFormDrawerOpenRef.current;
    prevFormDrawerOpenRef.current = cur;
    if (cur && was !== true) {
      taskLabelDirtyRef.current = false;
    }
  }, [formDrawerOpen]);

  useEffect(() => {
    if (!enabled) return;
    const drawerOk = formDrawerOpen === undefined || formDrawerOpen;
    if (!drawerOk) return;
    if (taskLabelDirtyRef.current) return;
    setTaskLabel(computeDefaultTaskLabel());
  }, [enabled, formDrawerOpen, taskKey, subtype, taskOptions, computeDefaultTaskLabel]);

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
    taskLabel,
    onTaskLabelChange,
    computeDefaultTaskLabel,
    mergeTaskLabelIntoParams,
    resetTaskLabelAfterSubmit,
  };
}
