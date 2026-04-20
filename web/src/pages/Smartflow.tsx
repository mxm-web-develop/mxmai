import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
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
} from 'antd';
import {
  createSmartflow,
  deleteSmartflow,
  executeSmartflow,
  getSmartflow,
  getSmartflowTask,
  listSmartflowTasks,
  listSmartflows,
  updateSmartflow,
  type SmartflowExecutionItem,
  type SmartflowListItem,
  type SmartflowSchemaBody,
} from '../api/client';
import { SmartflowDesigner } from '../components/smartflow-designer/SmartflowDesigner';
import { ExecutionTrace } from '../components/smartflow-page/ExecutionTrace';
import { useAuth } from '../context/AuthContext';

const DEFAULT_INPUT_JSON = `{
  "photography_type": "人像",
  "style": "classical",
  "tone": "warm",
  "location": "上海",
  "cultural_background": "海派文化",
  "subject": "古典暖调女性肖像"
}`;

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
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {inputSchema.map((field) => (
        <div key={field.name}>
          <Typography.Text strong style={{ fontSize: 12 }}>{field.name}</Typography.Text>
          {field.type === 'text' && (
            <Input
              size="small"
              value={String(value[field.name] ?? '')}
              onChange={(e) => onChange({ ...value, [field.name]: e.target.value })}
              style={{ marginTop: 4 }}
            />
          )}
          {field.type === 'json' && (
            <Input.TextArea
              size="small"
              rows={3}
              value={typeof value[field.name] === 'object' ? JSON.stringify(value[field.name], null, 2) : String(value[field.name] ?? '')}
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
        </div>
      ))}
    </Space>
  );
}

export default function Smartflow() {
  const { message } = App.useApp();
  const { isLoggedIn } = useAuth();
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

  const startNodeInputs = useMemo(() => {
    try {
      const schema = JSON.parse(crudSchemaJson) as SmartflowSchemaBody;
      const startNode = (schema.nodes || []).find((n) => (n as { type?: unknown }).type === 'start') as
        | { input?: unknown }
        | undefined;
      const input = startNode?.input;
      return Array.isArray(input) ? input : [];
    } catch {
      return [];
    }
  }, [crudSchemaJson]);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<SmartflowExecutionItem[]>([]);

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
    setCrudName('未命名工作流');
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
        message.error('schema 必须包含 nodes、edges 数组');
        return null;
      }
      return s;
    } catch {
      message.error('schema JSON 无效');
      return null;
    }
  };

  const onSave = async () => {
    if (!isLoggedIn) {
      message.warning('保存需要登录');
      return;
    }
    if (!crudName.trim()) {
      message.error('请填写名称');
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
        message.success('已创建');
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
        message.warning('请先选择工作流');
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
      message.success('已保存');
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
      message.success('已删除');
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
      message.warning('请先选择已保存的工作流');
      return;
    }
    let input_data: Record<string, unknown>;
    try {
      input_data = JSON.parse(inputJson) as Record<string, unknown>;
    } catch {
      message.error('input_data JSON 格式无效');
      return;
    }
    if (!isLoggedIn) {
      message.warning('执行需要登录');
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
      if (body?.data) setLastExecution(body.data);
      message.success('执行完成');
      void loadTasks();
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
      message.success('已刷新');
    }
  };

  const activeTitle = useMemo(() => {
    if (isCreating) return '新建工作流';
    if (selectedId) return crudName || selectedId;
    return '';
  }, [isCreating, selectedId, crudName]);

  const showEditor = isCreating || selectedId;

  return (
    <div className="page-smartflow">
      {/* <Typography.Paragraph type="secondary" style={{ marginBottom: 10, flexShrink: 0 }}>
        左侧选择或新建 Smartflow；每个工作流有独立画布。开始节点定义用户入参（{'{{input.x}}'}），下游节点可引用上游{' '}
        <Typography.Text code>{'{{nodeId.output.*}}'}</Typography.Text>。运行后可在「运行」页查看每步输出。
      </Typography.Paragraph> */}

      <div className="page-smartflow-shell">
        <aside className="page-smartflow-sidebar">
          <div className="sf-sidebar-actions">
            <Button className="sf-action-btn" type="primary" size="small" onClick={beginNewFlow}>
              新建
            </Button>
            <Button className="sf-action-btn" size="small" loading={loadingList} onClick={() => void loadFlows()}>
              刷新
            </Button>
          </div>
          <div className="page-smartflow-sidebar-scroll">
            {flows.length === 0 && !loadingList ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                暂无工作流
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
                    >
                      <div className="sf-flow-title">{f.name}</div>
                      <div className="sf-flow-sub">{f.id}</div>
                    </button>
                  );
                })}
              </Space>
            )}
          </div>
        </aside>

        <main className="page-smartflow-main">
          {!showEditor ? (
            <Empty description="请从左侧选择工作流，或点击「新建」" style={{ marginTop: 48 }} />
          ) : (
            <Card
              size="small"
              loading={crudLoading}
              title={
                <Space wrap>
                  <span>{activeTitle}</span>
                  {selectedId && <Tag>{selectedId}</Tag>}
                  {isCreating && <Tag color="blue">未保存</Tag>}
                </Space>
              }
              extra={
                <Space wrap className="sf-editor-actions">
                  {!isCreating && selectedId && (
                    <Popconfirm title="确定删除该工作流？" onConfirm={() => void onDeleteFlow()}>
                      <Button className="sf-action-btn" danger size="small" disabled={!isLoggedIn}>
                        删除
                      </Button>
                    </Popconfirm>
                  )}
                  <Button className="sf-action-btn" type="primary" size="small" loading={crudLoading} disabled={!isLoggedIn} onClick={() => void onSave()}>
                    {isCreating ? '创建' : '保存'}
                  </Button>
                </Space>
              }
            >
              {!isLoggedIn && (
                <Alert type="warning" message="登录后可保存、删除与执行" showIcon style={{ marginBottom: 12 }} />
              )}

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
                    label: '基本信息',
                    children: (
                      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                        {isCreating && (
                          <div>
                            <Typography.Text type="secondary">自定义 id（可选）</Typography.Text>
                            <Input
                              style={{ maxWidth: 360, marginTop: 4 }}
                              placeholder="留空则服务端生成"
                              value={crudIdDraft}
                              onChange={(e) => setCrudIdDraft(e.target.value)}
                            />
                          </div>
                        )}
                        <Space wrap>
                          <div>
                            <Typography.Text type="secondary">名称 *</Typography.Text>
                            <Input
                              style={{ width: 260, marginTop: 4 }}
                              value={crudName}
                              onChange={(e) => setCrudName(e.target.value)}
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary">分类</Typography.Text>
                            <Input
                              style={{ width: 140, marginTop: 4 }}
                              value={crudCategory}
                              onChange={(e) => setCrudCategory(e.target.value)}
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary">版本</Typography.Text>
                            <Input
                              style={{ width: 100, marginTop: 4 }}
                              value={crudVersion}
                              onChange={(e) => setCrudVersion(e.target.value)}
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary">状态</Typography.Text>
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
                              <Typography.Text type="secondary">公开</Typography.Text>
                              <Switch checked={crudIsPublic} onChange={setCrudIsPublic} />
                            </Space>
                          </div>
                        </Space>
                        <div>
                          <Typography.Text type="secondary">描述</Typography.Text>
                          <Input.TextArea rows={2} value={crudDescription} onChange={(e) => setCrudDescription(e.target.value)} style={{ marginTop: 4 }} />
                        </div>
                      </Space>
                    ),
                  },
                  {
                    key: 'canvas',
                    label: '画布',
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
                            message.info('已同步到画布');
                          }}
                        >
                          同步到画布
                        </Button>
                      </div>
                    ),
                  },
                  {
                    key: 'run',
                    label: '运行',
                    children: (
                      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                        <div>
                          <Typography.Text type="secondary">input_data</Typography.Text>
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
                          <Space style={{ marginTop: 8 }} wrap>
                            <Button type="primary" loading={executing} onClick={() => { setExecutionMode('run'); void onExecute(); }} disabled={!selectedId || isCreating}>
                              运行
                            </Button>
                            <Button loading={executing} onClick={() => { setExecutionMode('test'); void onExecute(); }} disabled={!selectedId || isCreating} style={{ marginLeft: 8 }}>
                              测试
                            </Button>
                            <Button size="small" onClick={() => { setInputJson(DEFAULT_INPUT_JSON); message.info('已切换摄影示例'); }}>摄影 input</Button>
                            <Button size="small" onClick={() => { setInputJson(MINIMAL_INPUT_JSON); message.info('已切换最小 input'); }}>最小 input</Button>
                          </Space>
                          {lastError && <Alert type="error" message={lastError} style={{ marginTop: 12 }} showIcon />}
                        </div>
                        <ExecutionTrace execution={lastExecution} mode={executionMode === 'test' ? 'full' : 'summary'} />
                        <Card size="small" title="最近执行记录" extra={<Button size="small" loading={tasksLoading} onClick={() => void loadTasks()} disabled={!isLoggedIn || !selectedId}>刷新</Button>}>
                          {!isLoggedIn || !selectedId ? (
                            <Typography.Text type="secondary">登录且选中已保存工作流后可查看</Typography.Text>
                          ) : (
                            <Table<SmartflowExecutionItem>
                              size="small"
                              rowKey="id"
                              loading={tasksLoading}
                              dataSource={tasks}
                              pagination={{ pageSize: 8 }}
                              columns={[
                                { title: 'id', dataIndex: 'id', ellipsis: true, width: 200 },
                                { title: 'status', dataIndex: 'status', width: 90 },
                                {
                                  title: '操作',
                                  key: 'op',
                                  width: 120,
                                  render: (_, row) => (
                                    <Space>
                                      <Button type="link" size="small" onClick={() => { setLastExecution(row); message.info('已载入下方轨迹'); }}>
                                        查看
                                      </Button>
                                      <Button type="link" size="small" onClick={() => void refreshOneTask(row.id)}>
                                        刷新
                                      </Button>
                                    </Space>
                                  ),
                                },
                              ]}
                            />
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
    </div>
  );
}
