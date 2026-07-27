/**
 * Admin：业务质检（评分配置 / 发起评估 / 历史与管线归因）
 * 布局对齐 AdminOps：page-card + admin-ops-page + admin-ops-card
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  createQualityEvalRun,
  getAdminTasks,
  getKnowledgeFolderItems,
  getKnowledgeFolders,
  getQualityEvalDefaults,
  getTask,
  getTaskFormConfigList,
  listQualityEvalRubrics,
  listQualityEvalRuns,
  reattributeQualityEvalRun,
  upsertQualityEvalRubric,
  type AdminTaskItem,
  type QualityEvalDimension,
  type QualityEvalRubric,
  type QualityEvalRun,
  type TaskFormConfigListItem,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { decodePossiblyMojibakeFilename } from '../lib/filenameEncoding';
import { resolveKnowledgeFolderText } from '../components/schema-fields/textSourceKnowledgeFolderUtils';
import type { KnowledgeFolderLinkItem } from '../api/client';

const { Text, Paragraph } = Typography;

type BizScope = 'writing' | 'graph' | 'video' | 'audio' | 'music';

const SCOPE_OPTIONS: Array<{ value: BizScope; label: string; enabled: boolean }> = [
  { value: 'writing', label: '写作', enabled: true },
  { value: 'graph', label: '图片（即将支持）', enabled: false },
  { value: 'video', label: '视频（即将支持）', enabled: false },
  { value: 'audio', label: '音频（即将支持）', enabled: false },
  { value: 'music', label: '音乐（即将支持）', enabled: false },
];

const DEFAULT_DIMS: QualityEvalDimension[] = [
  { key: 'data_authenticity', label: '数据鉴真', description: '事实与数据是否可核验、无明显编造', weight: 1.5, failBelow: 60 },
  { key: 'grammar', label: '语法', description: '用词语法是否规范', weight: 1, failBelow: 60 },
  { key: 'readability', label: '可读性', description: '结构清晰、易于阅读', weight: 1, failBelow: 60 },
  { key: 'ai_feel', label: '自然度', description: '是否过度模板化、空洞套话（越高越自然）', weight: 1, failBelow: 60 },
];

const SOURCE_KIND_LABEL: Record<string, string> = {
  paste: '粘贴',
  task: '系统任务',
  folder_item: '知识库',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '排队',
  scoring: '评分中',
  attributing: '归因中',
  completed: '完成',
  failed: '失败',
};

function businessKey(taskKey: string, subtype: string) {
  return `${taskKey}::${subtype}`;
}

function extractTextFromTaskPayload(data: unknown): string {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const task = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const inner = (task.task && typeof task.task === 'object' ? task.task : task) as Record<string, unknown>;
  const result = (inner.result || {}) as Record<string, unknown>;
  const md = (result.metadata || {}) as Record<string, unknown>;
  const rp = (inner.requestParams || {}) as Record<string, unknown>;
  const state = (rp.businessPipelineState || {}) as Record<string, unknown>;
  const candidates = [
    md.text,
    (md.finalArtifact as Record<string, unknown> | undefined)?.text,
    (state.finalArtifact as Record<string, unknown> | undefined)?.text,
    (state.coreArtifact as Record<string, unknown> | undefined)?.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

export default function AdminQualityEval() {
  const { message } = App.useApp();
  const { isLoggedIn, isAdmin } = useAuth();

  const [scope, setScope] = useState<BizScope>('writing');
  const [businesses, setBusinesses] = useState<TaskFormConfigListItem[]>([]);
  const [rubrics, setRubrics] = useState<QualityEvalRubric[]>([]);
  const [modelOptions, setModelOptions] = useState<Array<{ provider: string; modelKey: string; label: string }>>([]);
  const [runs, setRuns] = useState<QualityEvalRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [selectedBiz, setSelectedBiz] = useState<string>('');
  const [dims, setDims] = useState<QualityEvalDimension[]>(DEFAULT_DIMS);
  const [businessBrief, setBusinessBrief] = useState('');
  const [provider, setProvider] = useState('atlascloud');
  const [modelKey, setModelKey] = useState('openai/gpt-5.6-terra');
  const [autoOnComplete, setAutoOnComplete] = useState(false);

  const [runBiz, setRunBiz] = useState('');
  const [sourceKind, setSourceKind] = useState<'task' | 'folder_item' | 'paste'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [taskId, setTaskId] = useState('');
  const [adminTasks, setAdminTasks] = useState<AdminTaskItem[]>([]);
  const [kbFolders, setKbFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [kbFolderId, setKbFolderId] = useState('');
  const [kbItems, setKbItems] = useState<
    Array<{ id: string; task_id?: string; storage_object_id?: string; label: string; content_type?: string }>
  >([]);
  const [kbItemId, setKbItemId] = useState('');
  const [runModelOverride, setRunModelOverride] = useState<string | undefined>();

  const [detail, setDetail] = useState<QualityEvalRun | null>(null);

  const bizOptions = useMemo(
    () =>
      businesses.map((b) => ({
        value: businessKey(b.taskKey, b.subtype || ''),
        label: `${b.taskLabel || b.taskKey} / ${b.subtypeLabel || b.subtype || '-'}`,
        taskKey: b.taskKey,
        subtype: b.subtype || '',
      })),
    [businesses]
  );

  const configuredCount = useMemo(() => rubrics.filter((r) => r.is_active).length, [rubrics]);

  const parseBiz = useCallback(
    (key: string) => {
      const hit = bizOptions.find((b) => b.value === key);
      if (hit) return { taskKey: hit.taskKey, subtype: hit.subtype };
      const [taskKey, ...rest] = key.split('::');
      return { taskKey: taskKey || '', subtype: rest.join('::') };
    },
    [bizOptions]
  );

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, rubricRes, defRes, runsRes] = await Promise.all([
        getTaskFormConfigList({ scope }),
        listQualityEvalRubrics(scope),
        getQualityEvalDefaults(),
        listQualityEvalRuns({ scope, limit: 50 }),
      ]);
      if (listRes.error) message.error(listRes.error);
      else setBusinesses(listRes.data?.data?.items || []);
      if (rubricRes.error) message.error(rubricRes.error);
      else setRubrics(rubricRes.data?.data || []);
      if (defRes.data?.data?.modelOptions) setModelOptions(defRes.data.data.modelOptions);
      if (runsRes.error) message.error(runsRes.error);
      else {
        setRuns(runsRes.data?.data?.runs || []);
        setRunsTotal(runsRes.data?.data?.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [message, scope]);

  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      setSelectedBiz('');
      setRunBiz('');
      void loadBase();
    }
  }, [isLoggedIn, isAdmin, loadBase]);

  useEffect(() => {
    if (!selectedBiz) return;
    const { taskKey, subtype } = parseBiz(selectedBiz);
    const existing = rubrics.find((r) => r.task_key === taskKey && r.subtype === subtype);
    if (existing) {
      setDims(existing.dimensions?.length ? existing.dimensions : DEFAULT_DIMS);
      setBusinessBrief(existing.business_brief || '');
      setProvider(existing.provider || 'atlascloud');
      setModelKey(existing.model_key || 'openai/gpt-5.6-terra');
      setAutoOnComplete(Boolean(existing.auto_on_complete));
    } else {
      setDims(DEFAULT_DIMS);
      setBusinessBrief('');
      setProvider('atlascloud');
      setModelKey('openai/gpt-5.6-terra');
      setAutoOnComplete(false);
    }
  }, [selectedBiz, rubrics, parseBiz]);

  const loadAdminTasks = useCallback(async () => {
    const res = await getAdminTasks({ type: scope, status: 'completed', limit: 40 });
    if (res.error) {
      message.error(res.error);
      return;
    }
    setAdminTasks(res.data?.data?.tasks || []);
  }, [message, scope]);

  const loadKbFolders = useCallback(async () => {
    const folders = await getKnowledgeFolders({ force: true });
    setKbFolders(folders.map((f) => ({ id: f.id, name: f.name || f.id })));
  }, []);

  useEffect(() => {
    if (sourceKind === 'task') void loadAdminTasks();
    if (sourceKind === 'folder_item') void loadKbFolders();
  }, [sourceKind, loadAdminTasks, loadKbFolders]);

  useEffect(() => {
    if (!kbFolderId) {
      setKbItems([]);
      return;
    }
    void (async () => {
      try {
        const data = await getKnowledgeFolderItems(kbFolderId, { force: true });
        const list = (data.items || []).filter(
          (it): it is any => (it as any).type === 'link' || !!(it as any).ref_type
        );
        setKbItems(
          list.map((it: any, idx: number) => {
            const tid =
              it.task_id || (it.ref_type === 'task' ? it.id || it.ref_id : undefined);
            const storageId =
              it.object_id || (it.ref_type === 'storage_object' ? it.id : undefined);
            const rawName = it.name || it.metadata?.label || '';
            const niceName = decodePossiblyMojibakeFilename(rawName) || rawName;
            const labelParts = [it.metadata?.taskLabel, it.metadata?.subtypeLabel, niceName].filter(Boolean);
            return {
              id: String(storageId || tid || it.folder_item_id || it.id || idx),
              task_id: tid ? String(tid) : undefined,
              storage_object_id: storageId ? String(storageId) : undefined,
              content_type: it.content_type ? String(it.content_type) : undefined,
              label: labelParts.join(' · ') || `条目 ${idx + 1}`,
            };
          })
        );
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        setKbItems([]);
      }
    })();
  }, [kbFolderId, message]);

  const saveRubric = async () => {
    if (!selectedBiz) {
      message.warning('请先选择业务');
      return;
    }
    const { taskKey, subtype } = parseBiz(selectedBiz);
    if (!dims.length || dims.some((d) => !d.key.trim() || !d.label.trim())) {
      message.warning('请完善维度标识与名称');
      return;
    }
    setSaving(true);
    try {
      const res = await upsertQualityEvalRubric({
        scope,
        task_key: taskKey,
        subtype,
        dimensions: dims,
        business_brief: businessBrief,
        provider,
        model_key: modelKey,
        auto_on_complete: autoOnComplete,
        is_active: true,
      });
      if (res.error || !(res.data as any)?.success) {
        message.error(res.error || (res.data as any)?.error || '保存失败');
        return;
      }
      message.success('评分配置已保存');
      const rubricRes = await listQualityEvalRubrics(scope);
      if (!rubricRes.error) setRubrics(rubricRes.data?.data || []);
    } finally {
      setSaving(false);
    }
  };

  const submitEval = async () => {
    if (!runBiz) {
      message.warning('请选择评估对照的业务');
      return;
    }
    const { taskKey, subtype } = parseBiz(runBiz);
    setRunning(true);
    try {
      let text: string | undefined;
      let sourceRef: { taskId?: string; folderId?: string; itemId?: string } | null = null;
      const kind = sourceKind;

      if (kind === 'paste') {
        text = pasteText.trim();
        if (!text) {
          message.warning('请粘贴待评内容');
          return;
        }
      } else if (kind === 'task') {
        if (!taskId.trim()) {
          message.warning('请选择或填写任务 ID');
          return;
        }
        sourceRef = { taskId: taskId.trim() };
      } else if (kind === 'folder_item') {
        if (!kbFolderId || !kbItemId) {
          message.warning('请选择知识库文件夹与条目');
          return;
        }
        const item = kbItems.find((i) => i.id === kbItemId);
        const tid = item?.task_id;
        const storageObjectId = item?.storage_object_id;
        sourceRef = {
          folderId: kbFolderId,
          itemId: kbItemId,
          taskId: tid,
          storageObjectId,
        };
        if (storageObjectId && !tid) {
          try {
            const link: KnowledgeFolderLinkItem = {
              type: 'link',
              ref_type: 'storage_object',
              id: storageObjectId,
              object_id: storageObjectId,
              name: item?.label || storageObjectId,
              content_type: item?.content_type,
              created_at: new Date().toISOString(),
            };
            text = await resolveKnowledgeFolderText(link);
          } catch (e) {
            // 后端会再试拉存储对象；若前端已有粘贴正文则用粘贴
            if (pasteText.trim()) text = pasteText.trim();
            else {
              message.warning(
                e instanceof Error
                  ? `无法读取文件正文：${e.message}。可粘贴正文后重试。`
                  : '无法读取文件正文，请粘贴后重试'
              );
            }
          }
        } else if (tid) {
          try {
            const taskRes = await getTask(tid);
            const extracted = extractTextFromTaskPayload(taskRes.data);
            if (extracted) text = extracted;
          } catch {
            /* backend resolves */
          }
        } else if (pasteText.trim()) {
          text = pasteText.trim();
        }
      }

      const modelOpt = runModelOverride
        ? modelOptions.find((m) => m.modelKey === runModelOverride)
        : undefined;

      const res = await createQualityEvalRun({
        scope,
        taskKey,
        subtype,
        sourceKind: kind,
        sourceRef,
        text,
        modelOverride: modelOpt
          ? { provider: modelOpt.provider, modelKey: modelOpt.modelKey }
          : undefined,
      });

      if (res.error) {
        message.error(res.error);
        const failedRun = (res.data as any)?.data as QualityEvalRun | undefined;
        if (failedRun) setDetail(failedRun);
        return;
      }
      const run = res.data?.data;
      if (run) {
        message.success(`评估完成，总分 ${run.scores?.overall ?? '-'}`);
        setDetail(run);
      }
      const runsRes = await listQualityEvalRuns({ scope, limit: 50 });
      if (!runsRes.error) {
        setRuns(runsRes.data?.data?.runs || []);
        setRunsTotal(runsRes.data?.data?.total || 0);
      }
    } finally {
      setRunning(false);
    }
  };

  const onReattribute = async (id: string) => {
    setRunning(true);
    try {
      const res = await reattributeQualityEvalRun(id);
      if (res.error) {
        message.error(res.error);
        return;
      }
      message.success('管线归因已更新');
      if (res.data?.data) setDetail(res.data.data);
      void loadBase();
    } finally {
      setRunning(false);
    }
  };

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>业务质检</h2>
        <p>仅 Admin 可查看与配置。请使用管理员账号登录。</p>
      </div>
    );
  }

  const runColumns: ColumnsType<QualityEvalRun> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 168,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '业务',
      width: 200,
      ellipsis: true,
      render: (_, r) => {
        const hit = bizOptions.find((b) => b.taskKey === r.task_key && b.subtype === r.subtype);
        return hit?.label || `${r.task_key} / ${r.subtype}`;
      },
    },
    {
      title: '来源',
      width: 140,
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag>{SOURCE_KIND_LABEL[r.source_kind] || r.source_kind}</Tag>
          {r.is_system_generated ? <Tag color="blue">系统</Tag> : <Tag>外部</Tag>}
        </Space>
      ),
    },
    {
      title: '总分',
      width: 88,
      render: (_, r) =>
        r.scores?.overall != null ? (
          <Text strong style={{ color: r.scores.dimensions.some((d) => d.failed) ? '#b91c1c' : '#047857' }}>
            {r.scores.overall.toFixed(1)}
          </Text>
        ) : (
          '-'
        ),
    },
    {
      title: '低分维度',
      ellipsis: true,
      render: (_, r) => {
        const failed = r.scores?.dimensions?.filter((d) => d.failed) || [];
        if (!failed.length) return <Tag color="success">达标</Tag>;
        return (
          <Space size={4} wrap>
            {failed.map((d) => (
              <Tag color="error" key={d.key}>
                {d.label} {d.score}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 88,
      render: (v: string) => <Tag>{STATUS_LABEL[v] || v}</Tag>,
    },
    {
      title: '',
      width: 72,
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => setDetail(r)}>
          详情
        </Button>
      ),
    },
  ];

  const updateDim = (index: number, patch: Partial<QualityEvalDimension>) => {
    const next = [...dims];
    next[index] = { ...next[index], ...patch };
    setDims(next);
  };

  const configTab = (
    <div className="admin-ops-section admin-qe-section">
      <Card
        size="small"
        className="admin-ops-card"
        title="选择业务"
        extra={
          <Space size={8} wrap className="admin-ops-card-toolbar">
            <span className="muted">品类</span>
            <Select
              value={scope}
              style={{ width: 160 }}
              onChange={(v: BizScope) => setScope(v)}
              options={SCOPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                disabled: !o.enabled,
              }))}
            />
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择业务场景"
              style={{ minWidth: 260 }}
              options={bizOptions}
              value={selectedBiz || undefined}
              onChange={setSelectedBiz}
              loading={loading}
            />
            <Button type="primary" size="small" loading={saving} onClick={() => void saveRubric()} disabled={!selectedBiz}>
              保存配置
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadBase()} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <Text type="secondary">
          已配置 {configuredCount} 个业务评分标准。先按业务要求打分；系统任务若有低分维度，再回溯管线归因。
        </Text>
      </Card>

      {!selectedBiz ? (
        <Card size="small" className="admin-ops-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从上方选择一个业务场景，开始配置评分维度" />
        </Card>
      ) : (
        <>
          <Card size="small" className="admin-ops-card" title="业务要求与模型">
            <Form layout="vertical" className="admin-qe-form">
              <Form.Item
                label="业务要求说明"
                extra="用人话写清该业务成品应满足什么（结构、事实、语气等），供评分模型对照。"
              >
                <Input.TextArea
                  rows={3}
                  value={businessBrief}
                  onChange={(e) => setBusinessBrief(e.target.value)}
                  placeholder="例如：日报需含可核验数据、结论清晰、避免空泛套话…"
                />
              </Form.Item>
              <div className="admin-qe-form-row">
                <Form.Item label="默认评分模型" style={{ marginBottom: 0 }}>
                  <Select
                    style={{ width: 280 }}
                    value={modelKey}
                    onChange={(v) => {
                      setModelKey(v);
                      const opt = modelOptions.find((m) => m.modelKey === v);
                      if (opt) setProvider(opt.provider);
                    }}
                    options={modelOptions.map((m) => ({ value: m.modelKey, label: m.label }))}
                  />
                </Form.Item>
                <Form.Item
                  label="任务完成后自动评估"
                  extra="二期能力，开关可先配置"
                  style={{ marginBottom: 0 }}
                >
                  <Switch checked={autoOnComplete} onChange={setAutoOnComplete} />
                </Form.Item>
              </div>
            </Form>
          </Card>

          <Card
            size="small"
            className="admin-ops-card"
            title="评分维度"
            extra={
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  setDims([
                    ...dims,
                    {
                      key: `dim_${dims.length + 1}`,
                      label: '新维度',
                      description: '',
                      weight: 1,
                      failBelow: 60,
                    },
                  ])
                }
              >
                添加维度
              </Button>
            }
          >
            <div className="admin-qe-table-wrap">
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => String(i)}
                dataSource={dims}
                columns={[
                  {
                    title: '标识',
                    dataIndex: 'key',
                    width: 140,
                    render: (v, _, i) => (
                      <Input size="small" value={v} onChange={(e) => updateDim(i, { key: e.target.value })} />
                    ),
                  },
                  {
                    title: '名称',
                    dataIndex: 'label',
                    width: 120,
                    render: (v, _, i) => (
                      <Input size="small" value={v} onChange={(e) => updateDim(i, { label: e.target.value })} />
                    ),
                  },
                  {
                    title: '评分说明',
                    dataIndex: 'description',
                    render: (v, _, i) => (
                      <Input
                        size="small"
                        value={v}
                        onChange={(e) => updateDim(i, { description: e.target.value })}
                      />
                    ),
                  },
                  {
                    title: '权重',
                    dataIndex: 'weight',
                    width: 88,
                    render: (v, _, i) => (
                      <InputNumber
                        size="small"
                        min={0.1}
                        step={0.1}
                        value={v}
                        onChange={(n) => updateDim(i, { weight: Number(n) || 1 })}
                      />
                    ),
                  },
                  {
                    title: '及格线',
                    dataIndex: 'failBelow',
                    width: 88,
                    render: (v, _, i) => (
                      <InputNumber
                        size="small"
                        min={0}
                        max={100}
                        value={v}
                        onChange={(n) => updateDim(i, { failBelow: Number(n) || 60 })}
                      />
                    ),
                  },
                  {
                    title: '',
                    width: 44,
                    render: (_, __, i) => (
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setDims(dims.filter((_, j) => j !== i))}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );

  const runTab = (
    <div className="admin-ops-section admin-qe-section">
      <Card size="small" className="admin-ops-card" title="发起评估">
        <Form layout="vertical" className="admin-qe-form" style={{ maxWidth: 720 }}>
          <div className="admin-qe-form-row">
            <Form.Item label="品类" style={{ marginBottom: 0 }}>
              <Select
                value={scope}
                style={{ width: 160 }}
                onChange={(v: BizScope) => setScope(v)}
                options={SCOPE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  disabled: !o.enabled,
                }))}
              />
            </Form.Item>
            <Form.Item label="对照业务" required style={{ marginBottom: 0, flex: 1 }}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择业务场景"
                options={bizOptions}
                value={runBiz || undefined}
                onChange={setRunBiz}
              />
            </Form.Item>
          </div>

          <Form.Item label="内容来源" style={{ marginTop: 16 }}>
            <Select
              value={sourceKind}
              style={{ width: 240 }}
              onChange={setSourceKind}
              options={[
                { value: 'paste', label: '粘贴内容（外部稿）' },
                { value: 'task', label: '系统任务' },
                { value: 'folder_item', label: '知识库条目' },
              ]}
            />
          </Form.Item>

          {sourceKind === 'paste' && (
            <Form.Item label="待评内容">
              <Input.TextArea
                rows={12}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="粘贴需要质检的成品正文…"
              />
            </Form.Item>
          )}

          {sourceKind === 'task' && (
            <Form.Item label="系统任务">
              <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                <Select
                  showSearch
                  allowClear
                  placeholder="从近期已完成任务中选择"
                  style={{ width: '100%' }}
                  value={taskId || undefined}
                  onChange={(v) => setTaskId(v || '')}
                  options={adminTasks.map((t) => ({
                    value: t.id,
                    label: `${t.id.slice(0, 10)}… · ${t.status} · ${t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}`,
                  }))}
                />
                <Input
                  placeholder="或直接填写任务 ID"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                />
              </Space>
            </Form.Item>
          )}

          {sourceKind === 'folder_item' && (
            <>
              <div className="admin-qe-form-row">
                <Form.Item label="知识库文件夹" style={{ marginBottom: 0, flex: 1 }}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    value={kbFolderId || undefined}
                    onChange={(v) => {
                      setKbFolderId(v);
                      setKbItemId('');
                    }}
                    options={kbFolders.map((f) => ({ value: f.id, label: f.name }))}
                  />
                </Form.Item>
                <Form.Item label="条目" style={{ marginBottom: 0, flex: 1 }}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    value={kbItemId || undefined}
                    onChange={setKbItemId}
                    options={kbItems.map((i) => ({
                      value: i.id,
                      label: i.storage_object_id
                        ? `${i.label}（上传文件）`
                        : i.task_id
                          ? `${i.label}（任务）`
                          : i.label,
                    }))}
                  />
                </Form.Item>
              </div>
              <Form.Item
                label="补充正文"
                extra="条目未关联任务时可粘贴内容辅助评估"
                style={{ marginTop: 16 }}
              >
                <Input.TextArea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
              </Form.Item>
            </>
          )}

          <Form.Item label="本次模型（可选）">
            <Select
              allowClear
              style={{ width: 280 }}
              placeholder="使用该业务默认模型"
              value={runModelOverride}
              onChange={setRunModelOverride}
              options={modelOptions.map((m) => ({ value: m.modelKey, label: m.label }))}
            />
          </Form.Item>

          <Space size={12} wrap>
            <Button type="primary" loading={running} onClick={() => void submitEval()}>
              开始评估
            </Button>
            <Text type="secondary">先评业务达标，再对系统任务低分维度做管线归因</Text>
          </Space>
        </Form>
      </Card>
    </div>
  );

  const historyTab = (
    <div className="admin-ops-section admin-qe-section">
      <Card
        size="small"
        className="admin-ops-card"
        title="评估历史"
        extra={
          <Space size={8} className="admin-ops-card-toolbar">
            <span className="muted">共 {runsTotal} 条</span>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadBase()} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <div className="admin-qe-table-wrap">
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            columns={runColumns}
            dataSource={runs}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评估记录" /> }}
          />
        </div>
      </Card>
    </div>
  );

  return (
    <div className="page-card admin-ops-page admin-qe-page">
      <div className="admin-providers-content-wrap">
        <div className="admin-providers-content-inner">
          <Tabs
            defaultActiveKey="config"
            items={[
              { key: 'config', label: '评分配置', children: configTab },
              { key: 'run', label: '发起评估', children: runTab },
              { key: 'history', label: '评估历史', children: historyTab },
            ]}
          />
        </div>
      </div>

      <Drawer
        title="评估详情"
        size={720}
        open={!!detail}
        onClose={() => setDetail(null)}
        destroyOnHidden
        extra={
          detail?.is_system_generated && detail.scores?.dimensions?.some((d) => d.failed) ? (
            <Button size="small" loading={running} onClick={() => detail && void onReattribute(detail.id)}>
              重跑归因
            </Button>
          ) : null
        }
      >
        {detail && (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div className="admin-qe-detail-meta">
              <Space size={6} wrap>
                <Tag>{SOURCE_KIND_LABEL[detail.source_kind] || detail.source_kind}</Tag>
                {detail.is_system_generated ? <Tag color="blue">系统生成</Tag> : <Tag>外部内容</Tag>}
                <Tag>{STATUS_LABEL[detail.status] || detail.status}</Tag>
              </Space>
              <Text type="secondary" className="admin-qe-detail-sub">
                {detail.task_key} / {detail.subtype}
                {detail.model_key ? ` · ${detail.model_provider}/${detail.model_key}` : ''}
              </Text>
              {detail.error && <Alert type="error" title={detail.error} showIcon style={{ marginTop: 8 }} />}
            </div>

            {detail.scores && (
              <>
                <Card size="small" className="admin-ops-card" title="总分">
                  <Progress
                    percent={Math.round(detail.scores.overall)}
                    status={detail.scores.dimensions.some((d) => d.failed) ? 'exception' : 'success'}
                    format={() => detail.scores!.overall.toFixed(1)}
                  />
                  <Paragraph style={{ marginTop: 12, marginBottom: 4 }}>{detail.scores.summary}</Paragraph>
                  <Text type="secondary">类型匹配：{detail.scores.articleTypeFit || '—'}</Text>
                </Card>

                <div className="admin-qe-dim-grid">
                  {detail.scores.dimensions.map((d) => (
                    <Card
                      key={d.key}
                      size="small"
                      className="admin-ops-card"
                      title={`${d.label} · ${d.score}`}
                      extra={d.failed ? <Tag color="error">未达标</Tag> : <Tag color="success">达标</Tag>}
                    >
                      <Paragraph style={{ marginBottom: 8 }}>{d.comment || '—'}</Paragraph>
                      {d.evidence?.length > 0 && (
                        <ul className="admin-qe-evidence">
                          {d.evidence.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>
              </>
            )}

            {detail.attribution && (
              <Card size="small" className="admin-ops-card" title="管线归因">
                <Paragraph>{detail.attribution.summary || '—'}</Paragraph>
                {(detail.attribution.findings || []).length === 0 ? (
                  <Text type="secondary">无归因条目</Text>
                ) : (
                  <Timeline
                    items={(detail.attribution.findings || []).map((f) => ({
                      color: f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'orange' : 'blue',
                      children: (
                        <div>
                          <Text strong>
                            {f.step}
                            {f.phase ? ` · ${f.phase}` : ''}
                          </Text>
                          <div>{f.reason}</div>
                          <Text style={{ color: '#047857' }}>建议：{f.suggestion}</Text>
                          {f.relatedDimensions?.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              {f.relatedDimensions.map((k) => (
                                <Tag key={k}>{k}</Tag>
                              ))}
                            </div>
                          )}
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            )}

            {(detail.article_text_truncated || detail.article_text) && (
              <Card size="small" className="admin-ops-card" title="内容快照">
                <pre className="admin-qe-snapshot">
                  {(detail.article_text_truncated || detail.article_text || '').slice(0, 4000)}
                </pre>
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
