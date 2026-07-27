import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Modal,
} from 'antd';
import { LeftOutlined, RightOutlined, PlusOutlined, ReloadOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import {
  cancelSmartflowTask,
  createSmartflow,
  deleteSmartflow,
  deleteSmartflowTask,
  executeSmartflow,
  exportSmartflowBundle,
  getSmartflow,
  getSmartflowTask,
  importSmartflowBundle,
  listSmartflowTasks,
  pauseSmartflowTask,
  listSmartflows,
  updateSmartflow,
  type SmartflowExecutionItem,
  type SmartflowListItem,
  type SmartflowSchemaBody,
} from '../api/client';
import { SmartflowDesigner } from '../components/smartflow-designer/SmartflowDesigner';
import { ExecutionDetailModal } from '../components/smartflow-page/ExecutionDetailModal';
import { ExecutionTrace } from '../components/smartflow-page/ExecutionTrace';
import {
  extractStartFormConfig,
  SmartflowStartSchemaForm,
} from '../components/smartflow-page/SmartflowStartSchemaForm';
import { isActiveExecutionStatus } from '../components/smartflow-page/execution-detail-utils';
import { useAuth } from '../context/AuthContext';
import { useSmartflowExecutionSync } from '../hooks/useSmartflowExecutionSync';
import { mergeSmartflowExecution } from '../notifications/smartflow-ws';
import { PublishOpenApiDrawer, type PublishOpenApiPreset } from '../components/PublishOpenApiDrawer';
import { PageHint } from '../components/PageHint';

const DEFAULT_INPUT_JSON = `{
  "photography_type": "人像",
  "style": "classical",
  "tone": "warm",
  "location": "上海",
  "cultural_background": "海派文化",
  "subject": "古典暖调女性肖像"
}`;

const SIDEBAR_COLLAPSED_KEY = 'smartflow_sidebar_collapsed';

/** 收起侧栏：工作流名称首字（与名称一一对应，不用类型图标） */
function getFlowAbbr(name: string, id: string): string {
  const s = String(name || '').trim();
  if (s) {
    const c = Array.from(s)[0];
    return c || '·';
  }
  const fallback = (id || '').trim();
  return Array.from(fallback)[0] ?? '·';
}


const MINIMAL_INPUT_JSON = `{
  "topic": "用一句话解释什么是 Smartflow"
}`;

const MINIMAL_SCHEMA_JSON = `{
  "version": "2.0.0",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "name": "开始",
      "input": [{ "name": "topic", "type": "text", "content": "" }],
      "expected_outputs": [{ "type": "text", "name": "reply", "required": true }],
      "smartflow_name": ""
    },
    {
      "id": "llm",
      "type": "model",
      "name": "生成",
      "business_scope": "text",
      "model_type": "text",
      "model": "gpt-5-nano",
      "prompt": "用一句话回答：{{input.topic}}",
      "params": { "temperature": 0.5, "max_tokens": 256 }
    },
    {
      "id": "end",
      "type": "end",
      "name": "结束",
      "output_mapping": { "reply": "{{llm.output.text}}" },
      "validate_outputs": true
    }
  ],
  "edges": [
    { "from": "start", "to": "llm" },
    { "from": "llm", "to": "end" }
  ]
}`;

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const jsonTextareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 200,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 13,
  padding: 12,
  borderRadius: 8,
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
  background: 'var(--surface-1, rgba(0,0,0,0.2))',
  color: 'inherit',
  resize: 'vertical',
};

function InputDataForm({ inputSchema, value, onChange, }: { inputSchema: Array<{ name: string; type: string; content?: unknown }>; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; }) {
  if (!inputSchema || inputSchema.length === 0) {
    return (
      <textarea value={JSON.stringify(value, null, 2)} readOnly style={{ ...jsonTextareaStyle, minHeight: 120 }} />
    );
  }
  const jsonLikeTypes = new Set(['json', 'referenceImages', 'multiSelection', 'eshopGarmentBatch']);
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {inputSchema.map((field) => {
        const t = String(field.type || 'string');
        const v = value[field.name];
        return (
          <div key={field.name}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              {field.name}
              <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                ({t})
              </Typography.Text>
            </Typography.Text>
            {(t === 'text' || t === 'string' || t === 'selection') && (
              <Input
                size="small"
                value={String(v ?? '')}
                onChange={(e) => onChange({ ...value, [field.name]: e.target.value })}
                style={{ marginTop: 4 }}
              />
            )}
            {t === 'number' && (
              <Input
                size="small"
                type="number"
                value={String(v ?? '')}
                onChange={(e) => onChange({ ...value, [field.name]: Number(e.target.value) || 0 })}
                style={{ marginTop: 4 }}
              />
            )}
            {t === 'boolean' && (
              <Select
                size="small"
                style={{ width: '100%', marginTop: 4 }}
                value={v === true || v === 'true' ? 'true' : 'false'}
                options={[
                  { value: 'true', label: 'true' },
                  { value: 'false', label: 'false' },
                ]}
                onChange={(x) => onChange({ ...value, [field.name]: x === 'true' })}
              />
            )}
            {jsonLikeTypes.has(t) && (
              <Input.TextArea
                size="small"
                rows={t === 'eshopGarmentBatch' ? 5 : 3}
                value={typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '')}
                onChange={(e) => {
                  try {
                    onChange({ ...value, [field.name]: JSON.parse(e.target.value) });
                  } catch {
                    onChange({ ...value, [field.name]: e.target.value });
                  }
                }}
                style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              />
            )}
            {!(['text', 'string', 'selection', 'number', 'boolean'] as string[]).includes(t) &&
              !jsonLikeTypes.has(t) && (
              <Input
                size="small"
                value={String(v ?? '')}
                onChange={(e) => onChange({ ...value, [field.name]: e.target.value })}
                style={{ marginTop: 4 }}
              />
            )}
          </div>
        );
      })}
    </Space>
  );
}

export default function Smartflow() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { isLoggedIn } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [loadingList, setLoadingList] = useState(false);
  const [flows, setFlows] = useState<SmartflowListItem[]>([]);
  /** 当前选中的工作流 id；新建未保存时为 null */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 新建草稿模式（尚未 POST 创建） */
  const [isCreating, setIsCreating] = useState(false);

  const [inputJson, setInputJson] = useState(MINIMAL_INPUT_JSON);
  const [executing, setExecuting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<SmartflowExecutionItem | null>(null);
  const [executionMode, setExecutionMode] = useState<'test' | 'run'>('run');

  const [crudIdDraft, setCrudIdDraft] = useState('');
  const [crudName, setCrudName] = useState('');
  const [crudDescription, setCrudDescription] = useState('');
  const [crudCategory, setCrudCategory] = useState('demo');
  const [crudVersion, setCrudVersion] = useState('1.0.0');
  const [crudStatus, setCrudStatus] = useState<'draft' | 'active' | 'inactive'>('draft');
  const [crudIsPublic, setCrudIsPublic] = useState(false);
  const [crudSchemaJson, setCrudSchemaJson] = useState(MINIMAL_SCHEMA_JSON);
  const [designSyncToken, setDesignSyncToken] = useState(0);
  const [crudLoading, setCrudLoading] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState<'meta' | 'canvas' | 'json' | 'run'>('meta');

  const handleDesignerSchemaChange = useCallback((schema: SmartflowSchemaBody) => {
    setCrudSchemaJson(formatJson(schema));
  }, []);

  const startNode = useMemo(() => {
    try {
      const schema = JSON.parse(crudSchemaJson) as SmartflowSchemaBody;
      return (schema.nodes || []).find((n) => (n as { type?: unknown }).type === 'start') ?? null;
    } catch {
      return null;
    }
  }, [crudSchemaJson]);

  const startNodeInputs = useMemo(() => {
    const input = (startNode as { input?: unknown } | null)?.input;
    return Array.isArray(input) ? input : [];
  }, [startNode]);

  const startFormConfig = useMemo(() => extractStartFormConfig(startNode), [startNode]);

  const useStartSchemaForm = Boolean(startFormConfig.schema?.properties);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<SmartflowExecutionItem[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailExecutionId, setDetailExecutionId] = useState<string | null>(null);
  const [detailExecution, setDetailExecution] = useState<SmartflowExecutionItem | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPreset, setPublishPreset] = useState<PublishOpenApiPreset | null>(null);
  const [bundleExporting, setBundleExporting] = useState(false);
  const [bundleImporting, setBundleImporting] = useState(false);
  const [bundleImportPreview, setBundleImportPreview] = useState<{
    created: string[];
    updated: string[];
    skipped: string[];
    warnings: string[];
  } | null>(null);
  const [bundleImportOpen, setBundleImportOpen] = useState(false);
  const [pendingBundle, setPendingBundle] = useState<unknown>(null);

  const loadFlows = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await listSmartflows({ limit: 200 });
      if (res.error) {
        message.error(res.error);
        setFlows([]);
        return;
      }
      const body = res.data as { success?: boolean; data?: SmartflowListItem[] } | undefined;
      setFlows(body?.data ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadFlows();
  }, [loadFlows]);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn || !selectedId) return;
    setTasksLoading(true);
    try {
      const res = await listSmartflowTasks({ smartflowId: selectedId, limit: 30 });
      if (res.error) {
        message.error(res.error);
        setTasks([]);
        return;
      }
      const body = res.data as { success?: boolean; data?: SmartflowExecutionItem[] } | undefined;
      setTasks(body?.data ?? []);
    } finally {
      setTasksLoading(false);
    }
  }, [isLoggedIn, selectedId]);

  useEffect(() => {
    if (isLoggedIn && selectedId && !isCreating) void loadTasks();
  }, [isLoggedIn, selectedId, isCreating, loadTasks]);

  const applyExecutionPatch = useCallback((patch: Partial<SmartflowExecutionItem>) => {
    if (!patch.id) return;
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === patch.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = mergeSmartflowExecution(next[idx], patch);
      return next;
    });
    setLastExecution((prev) =>
      prev?.id === patch.id ? mergeSmartflowExecution(prev!, patch) : prev
    );
    setDetailExecution((prev) =>
      prev?.id === patch.id ? mergeSmartflowExecution(prev!, patch) : prev
    );
  }, []);

  const fetchExecutionIntoList = useCallback(
    async (executionId: string, opts?: { silent?: boolean }) => {
      const res = await getSmartflowTask(executionId);
      if (res.error) {
        if (!opts?.silent) message.error(res.error);
        return;
      }
      const body = res.data as { data?: SmartflowExecutionItem } | undefined;
      const row = body?.data;
      if (!row) return;
      if (selectedId && row.smartflow_id !== selectedId) return;

      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === executionId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...row };
          return next;
        }
        return [row, ...prev];
      });
      setLastExecution((prev) => (prev?.id === executionId ? row : prev));
      setDetailExecution((prev) => (prev?.id === executionId ? row : prev));
    },
    [message, selectedId]
  );

  useSmartflowExecutionSync({
    enabled: isLoggedIn && !!selectedId && !isCreating,
    smartflowId: selectedId,
    onPatch: applyExecutionPatch,
    onExecutionMissing: (id) => fetchExecutionIntoList(id, { silent: true }),
    onExecutionTerminal: (id) => fetchExecutionIntoList(id, { silent: true }),
    slowPollRefresh: loadTasks,
  });

  const fillFormFromSmartflow = (sf: SmartflowListItem) => {
    setCrudIdDraft(sf.id);
    setCrudName(sf.name ?? '');
    setCrudDescription((sf.description as string) ?? '');
    setCrudCategory((sf.category as string) ?? 'demo');
    setCrudVersion((sf.version as string) ?? '1.0.0');
    setCrudStatus((sf.status as 'draft' | 'active' | 'inactive') ?? 'draft');
    setCrudIsPublic(Boolean(sf.is_public));
    setCrudSchemaJson(formatJson(sf.schema ?? { nodes: [], edges: [] }));
  };

  const downloadSmartflowBundleFile = useCallback((filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportBundle = useCallback(async () => {
    if (!selectedId || isCreating) {
      message.warning(t('smartflow.page.selectFlowToExport'));
      return;
    }
    setBundleExporting(true);
    try {
      const res = await exportSmartflowBundle(selectedId);
      if (res.error) {
        message.error(res.error);
        return;
      }
      const body = res.data as { success?: boolean; data?: unknown; warnings?: string[] } | undefined;
      if (!body?.success || body.data == null) {
        message.error(t('smartflow.page.exportFailed'));
        return;
      }
      downloadSmartflowBundleFile(`${selectedId}.smartflow.json`, body.data);
      if (body.warnings?.length) message.warning(body.warnings.join('；'));
      message.success(t('smartflow.page.exported'));
    } finally {
      setBundleExporting(false);
    }
  }, [downloadSmartflowBundleFile, isCreating, message, selectedId]);

  const handleBundleImportFile = useCallback(
    async (file: File) => {
      setBundleImporting(true);
      try {
        const parsed: unknown = JSON.parse(await file.text());
        const dry = await importSmartflowBundle({ bundle: parsed, conflictPolicy: 'dry-run' });
        if (dry.error) {
          message.error(dry.error);
          return;
        }
        const body = dry.data as
          | {
              success?: boolean;
              data?: { created: string[]; updated: string[]; skipped: string[]; warnings: string[] };
            }
          | undefined;
        if (!body?.success || !body.data) {
          message.error(t('smartflow.page.importPreviewFailed'));
          return;
        }
        setPendingBundle(parsed);
        setBundleImportPreview(body.data);
        setBundleImportOpen(true);
      } catch {
        message.error(t('smartflow.page.jsonParseFailed'));
      } finally {
        setBundleImporting(false);
      }
    },
    [message]
  );

  const commitBundleImport = useCallback(
    async (policy: 'upsert' | 'skip') => {
      if (!pendingBundle) return;
      setBundleImporting(true);
      try {
        const res = await importSmartflowBundle({ bundle: pendingBundle, conflictPolicy: policy });
        if (res.error) {
          message.error(res.error);
          return;
        }
        const body = res.data as
          | {
              success?: boolean;
              data?: { created: string[]; updated: string[]; skipped: string[]; warnings: string[] };
            }
          | undefined;
        if (!body?.success || !body.data) {
          message.error(t('smartflow.page.importFailed'));
          return;
        }
        if (body.data.warnings?.length) message.warning(body.data.warnings.join('；'));
        message.success(policy === 'skip' ? t('smartflow.page.importDoneSkip') : t('smartflow.page.importDone'));
        setBundleImportOpen(false);
        setPendingBundle(null);
        setBundleImportPreview(null);
        await loadFlows();
        const firstId = body.data.created[0] ?? body.data.updated[0];
        if (firstId) {
          setIsCreating(false);
          setSelectedId(firstId);
          const gf = await getSmartflow(firstId);
          const row = (gf.data as { data?: SmartflowListItem } | undefined)?.data;
          if (row) {
            fillFormFromSmartflow(row);
            setDesignSyncToken((t) => t + 1);
          }
        }
      } finally {
        setBundleImporting(false);
      }
    },
    [loadFlows, message, pendingBundle]
  );

  const selectFlow = async (id: string) => {
    setCrudLoading(true);
    setIsCreating(false);
    setSelectedId(id);
    try {
      const res = await getSmartflow(id);
      if (res.error) {
        message.error(res.error);
        return;
      }
      const body = res.data as { data?: SmartflowListItem } | undefined;
      if (body?.data) {
        fillFormFromSmartflow(body.data);
        setDesignSyncToken((t) => t + 1);
      }
    } finally {
      setCrudLoading(false);
    }
  };

  const beginNewFlow = () => {
    setSelectedId(null);
    setIsCreating(true);
    setCrudIdDraft('');
    setCrudName(t('smartflow.page.unnamedFlow'));
    setCrudDescription('');
    setCrudCategory('demo');
    setCrudVersion('1.0.0');
    setCrudStatus('draft');
    setCrudIsPublic(false);
    setCrudSchemaJson(MINIMAL_SCHEMA_JSON);
    setDesignSyncToken((t) => t + 1);
    setLastExecution(null);
  };

  const parseSchema = (): SmartflowSchemaBody | null => {
    try {
      const s = JSON.parse(crudSchemaJson) as SmartflowSchemaBody;
      if (!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges)) {
        message.error(t('smartflow.page.schemaInvalid'));
        return null;
      }
      return s;
    } catch {
      message.error(t('smartflow.page.schemaJsonInvalid'));
      return null;
    }
  };

  const onSave = async () => {
    if (!isLoggedIn) {
      message.warning(t('smartflow.page.saveNeedsLogin'));
      return;
    }
    if (!crudName.trim()) {
      message.error(t('smartflow.page.nameRequiredMsg'));
      return;
    }
    const schema = parseSchema();
    if (!schema) return;
    setCrudLoading(true);
    try {
      if (isCreating) {
        const res = await createSmartflow({
          name: crudName.trim(),
          ...(crudIdDraft.trim() ? { id: crudIdDraft.trim() } : {}),
          description: crudDescription.trim() || undefined,
          category: crudCategory.trim() || undefined,
          version: crudVersion.trim() || '1.0.0',
          status: crudStatus,
          is_public: crudIsPublic,
          schema,
        });
        if (res.error) {
          message.error(res.error);
          return;
        }
        const body = res.data as { data?: SmartflowListItem } | undefined;
        message.success(t('smartflow.page.created'));
        if (body?.data?.id) {
          setIsCreating(false);
          setSelectedId(body.data.id);
          fillFormFromSmartflow(body.data);
          setDesignSyncToken((t) => t + 1);
        }
        void loadFlows();
        return;
      }
      if (!selectedId) {
        message.warning(t('smartflow.page.selectFlowFirst'));
        return;
      }
      const res = await updateSmartflow(selectedId, {
        name: crudName.trim(),
        description: crudDescription.trim() || undefined,
        category: crudCategory.trim() || undefined,
        version: crudVersion.trim() || undefined,
        status: crudStatus,
        is_public: crudIsPublic,
        schema,
      });
      if (res.error) {
        message.error(res.error);
        return;
      }
      message.success(t('smartflow.page.saved'));
      void loadFlows();
    } finally {
      setCrudLoading(false);
    }
  };

  const onDeleteFlow = async () => {
    if (!selectedId || isCreating) return;
    setCrudLoading(true);
    try {
      const res = await deleteSmartflow(selectedId);
      if (res.error) {
        message.error(res.error);
        return;
      }
      message.success(t('smartflow.page.deleted'));
      setSelectedId(null);
      setIsCreating(false);
      setCrudName('');
      setCrudSchemaJson(MINIMAL_SCHEMA_JSON);
      setLastExecution(null);
      void loadFlows();
    } finally {
      setCrudLoading(false);
    }
  };

  const onExecute = async () => {
    const runId = selectedId;
    if (!runId) {
      message.warning(t('smartflow.page.selectSavedFlow'));
      return;
    }
    let input_data: Record<string, unknown>;
    try {
      input_data = JSON.parse(inputJson) as Record<string, unknown>;
    } catch {
      message.error(t('smartflow.page.inputJsonInvalid'));
      return;
    }
    if (!isLoggedIn) {
      message.warning(t('smartflow.page.execNeedsLogin'));
      return;
    }
    setExecuting(true);
    setLastError(null);
    setLastExecution(null);
    try {
      const res = await executeSmartflow(runId, { input_data });
      if (res.error) {
        setLastError(res.error);
        const body = res.data as { data?: SmartflowExecutionItem } | undefined;
        if (body?.data) setLastExecution(body.data);
        message.error(res.error);
        return;
      }
      const body = res.data as { success?: boolean; data?: SmartflowExecutionItem } | undefined;
      if (body?.data) {
        setLastExecution(body.data);
        setTasks((prev) => {
          if (prev.some((t) => t.id === body.data!.id)) {
            return prev.map((t) => (t.id === body.data!.id ? { ...t, ...body.data! } : t));
          }
          return [body.data!, ...prev];
        });
      }
      message.success(t('smartflow.page.execSubmitted'));
    } finally {
      setExecuting(false);
    }
  };

  const refreshOneTask = async (id: string) => {
    const res = await getSmartflowTask(id);
    if (res.error) {
      message.error(res.error);
      return;
    }
    const body = res.data as { data?: SmartflowExecutionItem } | undefined;
    if (body?.data) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...body.data } : t)));
      if (lastExecution?.id === id) setLastExecution(body.data);
      message.success(t('smartflow.page.refreshed'));
    }
  };

  const isActiveExecution = isActiveExecutionStatus;

  const openExecutionDetail = (row: SmartflowExecutionItem) => {
    setDetailExecutionId(row.id);
    setDetailExecution(row);
    setDetailModalOpen(true);
  };

  const onDetailExecutionUpdated = useCallback((exec: SmartflowExecutionItem) => {
    setTasks((prev) => prev.map((t) => (t.id === exec.id ? { ...t, ...exec } : t)));
    setLastExecution((prev) => (prev?.id === exec.id ? exec : prev));
  }, []);

  const onPauseTask = async (row: SmartflowExecutionItem) => {
    const res = await pauseSmartflowTask(row.id);
    if (res.error) {
      message.error(res.error);
      return;
    }
    message.success(t('smartflow.page.paused'));
    await refreshOneTask(row.id);
    void loadTasks();
  };

  const onCancelTask = async (row: SmartflowExecutionItem) => {
    const res = await cancelSmartflowTask(row.id);
    if (res.error) {
      message.error(res.error);
      return;
    }
    message.success(t('smartflow.page.cancelled'));
    await refreshOneTask(row.id);
    void loadTasks();
  };

  const onDeleteTask = async (row: SmartflowExecutionItem) => {
    const res = await deleteSmartflowTask(row.id);
    if (res.error) {
      message.error(res.error);
      return;
    }
    message.success(t('smartflow.page.deleted'));
    setTasks((prev) => prev.filter((t) => t.id !== row.id));
    if (lastExecution?.id === row.id) setLastExecution(null);
    void loadTasks();
  };

  const activeTitle = useMemo(() => {
    if (isCreating) return t('smartflow.page.creatingFlow');
    if (selectedId) return crudName || selectedId;
    return '';
  }, [isCreating, selectedId, crudName]);

  const showEditor = isCreating || selectedId;

  return (
    <div className="page-smartflow">
      {/* <Typography.Paragraph type="secondary" style={{ marginBottom: 10, flexShrink: 0 }}>
        左侧选择或{t('smartflow.page.create')} Smartflow；每个工作流有独立{t('smartflow.page.canvasTab')}。开始节点定义用户入参（{'{{input.x}}'}），下游节点可引用上游{' '}
        <Typography.Text code>{'{{nodeId.output.*}}'}</Typography.Text>。{t('smartflow.page.runTab')}后可在「{t('smartflow.page.runTab')}」页查看每步输出。
      </Typography.Paragraph> */}

      <div className="page-smartflow-shell">
        <aside className={`page-smartflow-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
          <div className="sf-sidebar-actions">
            <Button
              className="sf-action-btn sf-action-btn--icon"
              size="small"
              onClick={() => {
                setSidebarCollapsed((v) => {
                  const next = !v;
                  try {
                    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
                  } catch {
                    // ignore
                  }
                  return next;
                });
              }}
              title={sidebarCollapsed ? t('smartflow.page.expand') : t('smartflow.page.collapse')}
              icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
            />
            <Button
              className={`sf-action-btn${sidebarCollapsed ? ' sf-action-btn--icon' : ''}`}
              type="primary"
              size="small"
              onClick={beginNewFlow}
              icon={<PlusOutlined />}
              title={t('smartflow.page.create')}
            >
              {sidebarCollapsed ? null : t('smartflow.page.create')}
            </Button>
            <Button
              className={`sf-action-btn${sidebarCollapsed ? ' sf-action-btn--icon' : ''}`}
              size="small"
              loading={loadingList}
              onClick={() => void loadFlows()}
              icon={<ReloadOutlined />}
              title={t('common.refresh')}
            >
              {sidebarCollapsed ? null : t('common.refresh')}
            </Button>
          </div>
          <div className="page-smartflow-sidebar-scroll">
            {flows.length === 0 && !loadingList ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('smartflow.page.noFlows')}
              </Typography.Text>
            ) : (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {flows.map((f) => {
                  const active = f.id === selectedId && !isCreating;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => void selectFlow(f.id)}
                      className={`sf-flow-item${active ? ' is-active' : ''}`}
                      title={`${f.name} (${f.id})`}
                    >
                      {sidebarCollapsed ? (
                        <span className="sf-flow-abbr">{getFlowAbbr(f.name, f.id)}</span>
                      ) : (
                        <>
                          <div className="sf-flow-title">{f.name}</div>
                          <div className="sf-flow-sub">{f.id}</div>
                        </>
                      )}
                    </button>
                  );
                })}
              </Space>
            )}
          </div>
        </aside>

        <main className="page-smartflow-main">
          {!showEditor ? (
            <Empty description={t('smartflow.page.selectFlow')} style={{ marginTop: 48 }} />
          ) : (
            <Card
              size="small"
              loading={crudLoading}
              title={
                <Space wrap>
                  <span>{activeTitle}</span>
                  {selectedId && <Tag>{selectedId}</Tag>}
                  {isCreating && <Tag color="blue">{t('smartflow.page.unsaved')}</Tag>}
                  {!isLoggedIn ? (
                    <PageHint
                      tone="warning"
                      emphasis
                      title={t('smartflow.page.loginRequired')}
                      description={t('smartflow.page.loginDesc')}
                    />
                  ) : null}
                </Space>
              }
              extra={
                <Space wrap className="sf-editor-actions">
                  {!isCreating && selectedId && (
                    <Button
                      className="sf-action-btn"
                      size="small"
                      icon={<DownloadOutlined />}
                      loading={bundleExporting}
                      disabled={!isLoggedIn}
                      onClick={() => void handleExportBundle()}
                    >
                      {t('smartflow.page.exportBundle')}
                    </Button>
                  )}
                  <Button
                    className="sf-action-btn"
                    size="small"
                    icon={<UploadOutlined />}
                    loading={bundleImporting}
                    disabled={!isLoggedIn}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.json,application/json';
                      input.onchange = () => {
                        const file = input.files?.[0];
                        if (file) void handleBundleImportFile(file);
                      };
                      input.click();
                    }}
                  >
                    {t('smartflow.page.importBundle')}
                  </Button>
                  {!isCreating && selectedId && (
                    <Button
                      className="sf-action-btn"
                      size="small"
                      disabled={!isLoggedIn}
                      onClick={() => {
                        setPublishPreset({
                          kind: 'smartflow',
                          smartflowId: selectedId,
                          titleHint: crudName || undefined,
                        });
                        setPublishOpen(true);
                      }}
                    >
                      {t('smartflow.page.publishApi')}
                    </Button>
                  )}
                  {!isCreating && selectedId && (
                    <Popconfirm title={t('smartflow.page.deleteFlowConfirm')} onConfirm={() => void onDeleteFlow()}>
                      <Button className="sf-action-btn" danger size="small" disabled={!isLoggedIn}>
                        {t('smartflow.page.delete')}
                      </Button>
                    </Popconfirm>
                  )}
                  <Button className="sf-action-btn" type="primary" size="small" loading={crudLoading} disabled={!isLoggedIn} onClick={() => void onSave()}>
                    {isCreating ? t('smartflow.page.createBtn') : t('smartflow.save')}
                  </Button>
                </Space>
              }
            >
              <Tabs
                activeKey={activeTabKey}
                onChange={(k) => {
                  const next = k as typeof activeTabKey;
                  setActiveTabKey(next);
                  /**
                   * ReactFlow 在父容器 `display:none` 时初始化，可能拿到 0 尺寸导致画布空白。
                   * 切到「画布」时强制触发一次 syncToken，让内部执行 fitView()。
                   */
                  if (next === 'canvas') {
                    queueMicrotask(() => setDesignSyncToken((t) => t + 1));
                  }
                }}
                items={[
                  {
                    key: 'meta',
                    label: t('smartflow.page.basicInfo'),
                    children: (
                      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                        {isCreating && (
                          <div>
                            <Typography.Text type="secondary">{t('smartflow.page.customId')}</Typography.Text>
                            <Input
                              style={{ maxWidth: 360, marginTop: 4 }}
                              placeholder={t('smartflow.page.autoGenerateId')}
                              value={crudIdDraft}
                              onChange={(e) => setCrudIdDraft(e.target.value)}
                            />
                          </div>
                        )}
                        <Space wrap>
                          <div>
                            <Typography.Text type="secondary">{t('smartflow.page.nameRequired')}</Typography.Text>
                            <Input
                              style={{ width: 260, marginTop: 4 }}
                              value={crudName}
                              onChange={(e) => setCrudName(e.target.value)}
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary">{t('smartflow.page.category')}</Typography.Text>
                            <Input
                              style={{ width: 140, marginTop: 4 }}
                              value={crudCategory}
                              onChange={(e) => setCrudCategory(e.target.value)}
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary">{t('smartflow.page.version')}</Typography.Text>
                            <Input
                              style={{ width: 100, marginTop: 4 }}
                              value={crudVersion}
                              onChange={(e) => setCrudVersion(e.target.value)}
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary">{t('smartflow.page.status')}</Typography.Text>
                            <Select
                              style={{ width: 110, marginTop: 4 }}
                              value={crudStatus}
                              onChange={(v) => setCrudStatus(v)}
                              options={[
                                { value: 'draft', label: 'draft' },
                                { value: 'active', label: 'active' },
                                { value: 'inactive', label: 'inactive' },
                              ]}
                            />
                          </div>
                          <div style={{ marginTop: 20 }}>
                            <Space>
                              <Typography.Text type="secondary">{t('smartflow.page.public')}</Typography.Text>
                              <Switch checked={crudIsPublic} onChange={setCrudIsPublic} />
                            </Space>
                          </div>
                        </Space>
                        <div>
                          <Typography.Text type="secondary">{t('smartflow.page.description')}</Typography.Text>
                          <Input.TextArea rows={2} value={crudDescription} onChange={(e) => setCrudDescription(e.target.value)} style={{ marginTop: 4 }} />
                        </div>
                      </Space>
                    ),
                  },
                  {
                    key: 'canvas',
                    label: t('smartflow.page.canvasTab'),
                    children: (
                      <div style={{ height: '70vh', minHeight: 520 }}>
                        <SmartflowDesigner
                          schemaJson={crudSchemaJson}
                          syncToken={designSyncToken}
                          onSchemaChange={handleDesignerSchemaChange}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'json',
                    label: 'schema JSON',
                    children: (
                      <div>
                        <textarea
                          value={crudSchemaJson}
                          onChange={(e) => setCrudSchemaJson(e.target.value)}
                          spellCheck={false}
                          style={{ ...jsonTextareaStyle, minHeight: 280 }}
                        />
                        <Button
                          size="small"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            setDesignSyncToken((t) => t + 1);
                            message.info(t('smartflow.page.syncedToCanvas'));
                          }}
                        >
                          {t('smartflow.page.syncToCanvas')}
                        </Button>
                      </div>
                    ),
                  },
                  {
                    key: 'run',
                    label: t('smartflow.page.runTab'),
                    children: (
                      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                        <div>
                          <Typography.Text type="secondary">input_data</Typography.Text>
                          {useStartSchemaForm && startFormConfig.schema ? (
                            <SmartflowStartSchemaForm
                              schema={startFormConfig.schema}
                              uiSchema={startFormConfig.uiSchema ?? undefined}
                              value={((): Record<string, unknown> => {
                                try {
                                  return JSON.parse(inputJson) as Record<string, unknown>;
                                } catch {
                                  return {};
                                }
                              })()}
                              onChange={(v) => setInputJson(JSON.stringify(v, null, 2))}
                            />
                          ) : (
                            <InputDataForm
                              inputSchema={startNodeInputs}
                              value={((): Record<string, unknown> => {
                                try {
                                  return JSON.parse(inputJson);
                                } catch {
                                  return {};
                                }
                              })()}
                              onChange={(v) => setInputJson(JSON.stringify(v, null, 2))}
                            />
                          )}
                          <Space style={{ marginTop: 8 }} wrap>
                            <Button type="primary" loading={executing} onClick={() => { setExecutionMode('run'); void onExecute(); }} disabled={!selectedId || isCreating}>
                              {t('smartflow.page.runTab')}
                            </Button>
                            <Button loading={executing} onClick={() => { setExecutionMode('test'); void onExecute(); }} disabled={!selectedId || isCreating} style={{ marginLeft: 8 }}>
                              {t('smartflow.page.test')}
                            </Button>
                            <Button size="small" onClick={() => { setInputJson(DEFAULT_INPUT_JSON); message.info(t('smartflow.page.switchedPhoto')); }}>{t('smartflow.page.photoInput')}</Button>
                            <Button size="small" onClick={() => { setInputJson(MINIMAL_INPUT_JSON); message.info(t('smartflow.page.switchedMinimal')); }}>{t('smartflow.page.minimalInput')}</Button>
                          </Space>
                          {lastError && <Alert type="error" title={lastError} style={{ marginTop: 12 }} showIcon />}
                        </div>
                        <ExecutionTrace execution={lastExecution} mode={executionMode === 'test' ? 'full' : 'summary'} />
                        <Card size="small" title={t('smartflow.page.recentExecutions')} extra={<Button size="small" loading={tasksLoading} onClick={() => void loadTasks()} disabled={!isLoggedIn || !selectedId}>{t('common.refresh')}</Button>}>
                          {!isLoggedIn || !selectedId ? (
                            <Typography.Text type="secondary">{t('smartflow.page.loginToViewExecutions')}</Typography.Text>
                          ) : (
                            <div className="sf-table-fixed-y">
                              <Table<SmartflowExecutionItem>
                                size="small"
                                rowKey="id"
                                loading={tasksLoading}
                                dataSource={tasks}
                                pagination={{ pageSize: 8 }}
                                scroll={{ y: 240 }}
                                sticky
                                columns={[
                                  {
                                    title: 'id',
                                    dataIndex: 'id',
                                    width: 240,
                                    render: (v) => (
                                      <div className="sf-table-cell-scroll">{String(v ?? '')}</div>
                                    ),
                                  },
                                  {
                                    title: 'status',
                                    dataIndex: 'status',
                                    width: 100,
                                    render: (v: string) => {
                                      const color =
                                        v === 'completed'
                                          ? 'success'
                                          : v === 'failed'
                                            ? 'error'
                                            : v === 'running'
                                              ? 'processing'
                                              : v === 'paused'
                                                ? 'warning'
                                                : v === 'cancelled'
                                                  ? 'default'
                                                  : 'default';
                                      return <Tag color={color}>{v}</Tag>;
                                    },
                                  },
                                  {
                                    title: t('smartflow.page.actions'),
                                    key: 'op',
                                    width: 220,
                                    render: (_, row) => (
                                      <Space size={0} wrap>
                                        <Button type="link" size="small" onClick={() => openExecutionDetail(row)}>
                                          {t('smartflow.execution.view')}
                                        </Button>
                                        <Button type="link" size="small" onClick={() => void refreshOneTask(row.id)}>
                                          {t('common.refresh')}
                                        </Button>
                                        {isActiveExecution(String(row.status)) && (
                                          <Button type="link" size="small" onClick={() => void onPauseTask(row)}>
                                            {t('smartflow.page.pause')}
                                          </Button>
                                        )}
                                        {(isActiveExecution(String(row.status)) || row.status === 'paused') && (
                                          <Button type="link" size="small" danger onClick={() => void onCancelTask(row)}>
                                            {t('smartflow.page.cancel')}
                                          </Button>
                                        )}
                                        <Popconfirm
                                          title={t('smartflow.page.deleteExecTitle')}
                                          description={isActiveExecution(String(row.status)) ? t('smartflow.page.deleteExecActive') : undefined}
                                          onConfirm={() => void onDeleteTask(row)}
                                          okText={t('smartflow.page.delete')}
                                          cancelText={t('common.cancel')}
                                        >
                                          <Button type="link" size="small" danger>
                                            {t('smartflow.page.delete')}
                                          </Button>
                                        </Popconfirm>
                                      </Space>
                                    ),
                                  },
                                ]}
                              />
                            </div>
                          )}
                        </Card>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </main>
      </div>

      <ExecutionDetailModal
        open={detailModalOpen}
        executionId={detailExecutionId}
        flowName={crudName || selectedId || undefined}
        initialExecution={detailExecution}
        onClose={() => {
          setDetailModalOpen(false);
          setDetailExecutionId(null);
          setDetailExecution(null);
        }}
        onExecutionUpdated={onDetailExecutionUpdated}
      />

      <Modal
        title={t('smartflow.page.importPreviewTitle')}
        open={bundleImportOpen}
        onCancel={() => {
          setBundleImportOpen(false);
          setPendingBundle(null);
          setBundleImportPreview(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setBundleImportOpen(false)}>
            {t('smartflow.page.cancel')}
          </Button>,
          <Button key="skip" loading={bundleImporting} onClick={() => void commitBundleImport('skip')}>
            {t('smartflow.page.importSkip')}
          </Button>,
          <Button
            key="upsert"
            type="primary"
            loading={bundleImporting}
            onClick={() => void commitBundleImport('upsert')}
          >
            {t('smartflow.page.importUpsert')}
          </Button>,
        ]}
      >
        {bundleImportPreview && (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <div>{t('smartflow.page.willCreate', { items: bundleImportPreview.created.join(', ') || t('smartflow.page.none') })}</div>
            <div>{t('smartflow.page.willUpdate', { items: bundleImportPreview.updated.join(', ') || t('smartflow.page.none') })}</div>
            <div>{t('smartflow.page.willSkip', { items: bundleImportPreview.skipped.join(', ') || t('smartflow.page.none') })}</div>
            {bundleImportPreview.warnings.length > 0 && (
              <Alert type="warning" title={bundleImportPreview.warnings.join('；')} />
            )}
          </Space>
        )}
      </Modal>

      <PublishOpenApiDrawer
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        preset={publishPreset}
      />
    </div>
  );
}
