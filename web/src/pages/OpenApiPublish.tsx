/**
 * 开放 API 发布 — 独立管理页：发布/下架、业务与 Smartflow、第三方调用统计
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Dropdown,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  ReloadOutlined,
  LineChartOutlined,
  UnorderedListOutlined,
  BookOutlined,
  BarChartOutlined,
  MoreOutlined,
  SyncOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import {
  deletePublishedApi,
  disablePublishedApi,
  enablePublishedApi,
  getOpenApiManifest,
  getTaskFormConfigList,
  listPublishedApis,
  listSmartflows,
  republishPublishedApi,
  type PublishedApiItem,
  type SmartflowListItem,
  type TaskFormConfigListItem,
} from '../api/client';
import {
  OpenApiIntegrationContent,
  parseOpenApiManifestResponse,
} from '../components/OpenApiIntegrationContent';
import { PublishOpenApiDrawer, type PublishOpenApiPreset } from '../components/PublishOpenApiDrawer';
import { PartnerAppsPanel } from '../components/PartnerAppsPanel';
import { AccountUsagePanel } from '../components/AccountUsagePanel';
import { pageCardTitle, PageHint } from '../components/PageHint';
import { TABLE_SCROLL_Y_OPEN_API_MANAGE } from '../utils/tableLayout';

const TASK_SCOPES = ['writing', 'graph', 'text', 'audio', 'music', 'video'] as const;

function taskV2Key(scope: string, taskKey: string, subtype: string | null) {
  return `${scope}/${taskKey}/${subtype ?? ''}`;
}

function formatTarget(row: PublishedApiItem): string {
  if (row.kind === 'smartflow') return `Smartflow · ${row.smartflow_id ?? '—'}`;
  return `${row.task_v2_scope}/${row.task_v2_task_key}${row.task_v2_subtype ? `/${row.task_v2_subtype}` : ''}`;
}

export type OpenApiPublishProps = {
  /** 嵌入账号中心 Tab，不展示独立页头 */
  embedded?: boolean;
  /** 嵌入时只渲染指定面板 */
  panel?: 'manage' | 'stats';
  /** 发布管理页点击「统计」时跳转账号「用量统计」Tab */
  onOpenStats?: (apiId: string, slug: string) => void;
};

export default function OpenApiPublish({
  embedded = false,
  panel,
  onOpenStats,
}: OpenApiPublishProps = {}) {
  const { message, modal } = App.useApp();
  const { user, isLoggedIn, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('manage');
  const [apis, setApis] = useState<PublishedApiItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const [publishPreset, setPublishPreset] = useState<PublishOpenApiPreset | null>(null);

  const [bizModalOpen, setBizModalOpen] = useState(false);
  const [bizScope, setBizScope] = useState<string>('writing');
  const [bizItems, setBizItems] = useState<TaskFormConfigListItem[]>([]);
  const [bizLoading, setBizLoading] = useState(false);

  const [sfModalOpen, setSfModalOpen] = useState(false);
  const [flows, setFlows] = useState<SmartflowListItem[]>([]);
  const [sfLoading, setSfLoading] = useState(false);

  const publishedTaskKeys = useMemo(() => {
    const s = new Set<string>();
    for (const a of apis) {
      if (a.kind === 'task_v2' && a.task_v2_scope && a.task_v2_task_key) {
        s.add(taskV2Key(a.task_v2_scope, a.task_v2_task_key, a.task_v2_subtype));
      }
    }
    return s;
  }, [apis]);

  const publishedSmartflowIds = useMemo(() => {
    return new Set(apis.filter((a) => a.kind === 'smartflow' && a.smartflow_id).map((a) => a.smartflow_id!));
  }, [apis]);

  const loadPublished = useCallback(async () => {
    setListLoading(true);
    const res = await listPublishedApis({ limit: 200 });
    if (!res.error && (res.data as { data?: PublishedApiItem[] })?.data) {
      setApis((res.data as { data: PublishedApiItem[] }).data);
    } else if (res.error) message.error(res.error);
    setListLoading(false);
  }, [message]);

  const loadBizItems = useCallback(async (scope: string) => {
    setBizLoading(true);
    const res = await getTaskFormConfigList({ scope });
    if (!res.error && (res.data as { data?: { items?: TaskFormConfigListItem[] } })?.data?.items) {
      setBizItems((res.data as { data: { items: TaskFormConfigListItem[] } }).data.items);
    } else {
      setBizItems([]);
    }
    setBizLoading(false);
  }, []);

  const loadFlows = useCallback(async () => {
    setSfLoading(true);
    const res = await listSmartflows({ limit: 200 });
    const body = res.data as { data?: SmartflowListItem[] } | undefined;
    const list = body?.data ?? [];
    const uid = user?.id;
    setFlows(
      uid && !isAdmin
        ? list.filter((f) => f.author_id === uid || !f.author_id)
        : list
    );
    setSfLoading(false);
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!isLoggedIn) return;
    void loadPublished();
  }, [isLoggedIn, loadPublished]);

  useEffect(() => {
    if (!bizModalOpen) return;
    void loadBizItems(bizScope);
  }, [bizModalOpen, bizScope, loadBizItems]);

  useEffect(() => {
    if (!sfModalOpen) return;
    void loadFlows();
  }, [sfModalOpen, loadFlows]);

  const refreshAll = () => {
    void loadPublished();
  };

  const openPublishBusiness = (scope: string, taskKey: string, subtype: string | null, label: string) => {
    setPublishPreset({
      kind: 'task_v2',
      taskV2Scope: scope,
      taskV2TaskKey: taskKey,
      taskV2Subtype: subtype ?? undefined,
      titleHint: label,
    });
    setPublishDrawerOpen(true);
    setBizModalOpen(false);
  };

  const openPublishSmartflow = (flow: SmartflowListItem) => {
    setPublishPreset({
      kind: 'smartflow',
      smartflowId: flow.id,
      titleHint: flow.name,
    });
    setPublishDrawerOpen(true);
    setSfModalOpen(false);
  };

  const openIntegrationDoc = useCallback(
    async (row: PublishedApiItem) => {
      const res = await getOpenApiManifest(row.slug);
      if (res.error) {
        message.error(res.error);
        return;
      }
      const m = parseOpenApiManifestResponse(res);
      if (!m) {
        message.error('无法解析接口文档');
        return;
      }
      modal.info({
        title: `对接：${row.slug}`,
        width: 760,
        styles: { body: { maxHeight: '70vh', overflow: 'auto' } },
        content: <OpenApiIntegrationContent manifest={m} />,
      });
    },
    [message, modal]
  );

  const openRowStats = useCallback(
    (row: PublishedApiItem) => {
      if (onOpenStats) onOpenStats(row.id, row.slug);
      else setActiveTab('stats');
    },
    [onOpenStats]
  );

  const confirmDisableApi = useCallback(
    (row: PublishedApiItem) => {
      modal.confirm({
        title: '下架 API',
        content: `确定下架 ${row.slug}？第三方将无法继续调用。`,
        okText: '下架',
        okButtonProps: { danger: true },
        onOk: async () => {
          const res = await disablePublishedApi(row.id);
          if (res.error) message.error(res.error);
          else {
            message.success('已下架');
            refreshAll();
          }
        },
      });
    },
    [message, modal, refreshAll]
  );

  const confirmDeleteApi = useCallback(
    (row: PublishedApiItem) => {
      modal.confirm({
        title: '永久删除',
        content: (
          <>
            确定永久删除 <Typography.Text code>{row.slug}</Typography.Text>？
            <br />
            slug 将释放可再次使用，历史调用统计一并删除，不可恢复。
          </>
        ),
        okText: '永久删除',
        okButtonProps: { danger: true },
        onOk: async () => {
          const res = await deletePublishedApi(row.id);
          if (res.error) message.error(res.error);
          else {
            message.success('已永久删除');
            refreshAll();
          }
        },
      });
    },
    [message, modal, refreshAll]
  );

  const publishedColumns: ColumnsType<PublishedApiItem> = useMemo(
    () => [
      {
        title: 'API',
        key: 'api',
        width: 240,
        fixed: 'left',
        render: (_: unknown, r) => (
          <div className="open-api-cell-api">
            <Typography.Text code className="open-api-cell-slug">
              {r.slug}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis className="open-api-cell-title">
              {r.title}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: '类型',
        dataIndex: 'kind',
        width: 96,
        render: (k: string) => (
          <Tag className="open-api-kind-tag" color={k === 'smartflow' ? 'purple' : 'blue'} bordered={false}>
            {k === 'smartflow' ? 'Smartflow' : '业务'}
          </Tag>
        ),
      },
      {
        title: '绑定目标',
        key: 'target',
        ellipsis: true,
        render: (_: unknown, r) => (
          <span className="open-api-target" title={formatTarget(r)}>
            {formatTarget(r)}
          </span>
        ),
      },
      {
        title: '版本 / 状态',
        key: 'meta',
        width: 128,
        render: (_: unknown, r) => (
          <div className="open-api-cell-meta">
            <Tag bordered={false} className="open-api-schema-tag">
              v{r.schema_version}
            </Tag>
            <Badge
              status={r.is_enabled ? 'success' : 'default'}
              text={r.is_enabled ? '运行中' : '已下架'}
            />
          </div>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 148,
        fixed: 'right',
        render: (_: unknown, r: PublishedApiItem) => {
          const moreItems: MenuProps['items'] = [
            {
              key: 'republish',
              icon: <SyncOutlined />,
              label: '重新发布',
              onClick: async () => {
                const res = await republishPublishedApi(r.id);
                if (res.error) message.error(res.error);
                else {
                  message.success('已刷新 Schema 快照');
                  refreshAll();
                }
              },
            },
            { type: 'divider' },
            r.is_enabled
              ? {
                  key: 'disable',
                  icon: <PauseCircleOutlined />,
                  label: '下架',
                  danger: true,
                  onClick: () => confirmDisableApi(r),
                }
              : {
                  key: 'enable',
                  icon: <PlayCircleOutlined />,
                  label: '重新上架',
                  onClick: async () => {
                    const res = await enablePublishedApi(r.id);
                    if (res.error) message.error(res.error);
                    else {
                      message.success('已重新上架');
                      refreshAll();
                    }
                  },
                },
            ...(!r.is_enabled
              ? [
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: '永久删除',
                    danger: true,
                    onClick: () => confirmDeleteApi(r),
                  } as const,
                ]
              : []),
          ];

          return (
            <div className="open-api-row-actions">
              <Tooltip title="对接说明">
                <Button
                  type="text"
                  size="small"
                  className="open-api-row-actions__btn"
                  icon={<BookOutlined />}
                  onClick={() => void openIntegrationDoc(r)}
                >
                  文档
                </Button>
              </Tooltip>
              <Tooltip title="调用统计">
                <Button
                  type="text"
                  size="small"
                  className="open-api-row-actions__btn"
                  icon={<BarChartOutlined />}
                  onClick={() => openRowStats(r)}
                >
                  统计
                </Button>
              </Tooltip>
              <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
                <Button
                  type="text"
                  size="small"
                  className="open-api-row-actions__btn open-api-row-actions__more"
                  icon={<MoreOutlined />}
                  aria-label="更多操作"
                />
              </Dropdown>
            </div>
          );
        },
      },
    ],
    [confirmDeleteApi, confirmDisableApi, message, openIntegrationDoc, openRowStats, refreshAll]
  );

  if (!isLoggedIn) {
    if (embedded) {
      return (
        <div className="account-tab-pane account-tab-pane--scroll">
          <Typography.Text type="secondary">请先登录</Typography.Text>
        </div>
      );
    }
    return (
      <div className="page-card">
        <Typography.Title level={4}>API 发布</Typography.Title>
        <Typography.Text type="secondary">请先登录</Typography.Text>
      </div>
    );
  }

  const manageTab = (
    <div className="open-api-tab-fill">
      <Card
        className="page-table-card open-api-manage-card"
        title={pageCardTitle('已发布 API', {
          title: '发布者与计费',
          description:
            '第三方使用自己的 API Key 调用你发布的 slug，MXM-TOKEN 从你的账户扣减。slug 创建后不可改；业务配置变更后请「重新发布」刷新入参快照。',
        })}
        extra={
          <Space size={8} wrap className="open-api-toolbar-extra console-toolbar">
            <Button icon={<ReloadOutlined />} loading={listLoading} onClick={() => void loadPublished()}>
              刷新
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setBizModalOpen(true)}>
              发布业务
            </Button>
            {isAdmin ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setSfModalOpen(true)}>
                Smartflow
              </Button>
            ) : null}
          </Space>
        }
      >
        <div className="page-table-panel">
          <div className="page-table-wrap">
            <Table<PublishedApiItem>
              rowKey="id"
              size="small"
              loading={listLoading}
              dataSource={apis}
              columns={publishedColumns}
              scroll={{ x: 920, y: TABLE_SCROLL_Y_OPEN_API_MANAGE }}
              sticky
              pagination={{ pageSize: 20, showSizeChanger: true, size: 'small' }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="还没有对外发布的 API"
                    className="open-api-empty"
                  >
                    <Space wrap>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setBizModalOpen(true)}>
                        发布业务
                      </Button>
                      {isAdmin ? (
                        <Button icon={<PlusOutlined />} onClick={() => setSfModalOpen(true)}>
                          发布 Smartflow
                        </Button>
                      ) : null}
                    </Space>
                  </Empty>
                ),
              }}
            />
          </div>
        </div>
      </Card>
    </div>
  );

  const statsTab = (
    <AccountUsagePanel initialSource="open_api" />
  );

  const publishModals = (
    <>
      <Modal
        title="选择要发布的业务（Task V2）"
        open={bizModalOpen}
        onCancel={() => setBizModalOpen(false)}
        footer={null}
        width={720}
      >
        <Space style={{ marginBottom: 12 }}>
          <span>业务域</span>
          <Select
            style={{ width: 140 }}
            value={bizScope}
            onChange={setBizScope}
            options={TASK_SCOPES.map((s) => ({ value: s, label: s }))}
          />
        </Space>
        <Table<TaskFormConfigListItem>
          size="small"
          loading={bizLoading}
          rowKey={(r) => taskV2Key(bizScope, r.taskKey, r.subtype)}
          dataSource={bizItems}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: '业务',
              render: (_: unknown, r) =>
                r.taskLabel || r.taskKey + (r.subtype ? ` / ${r.subtype}` : ''),
            },
            {
              title: '标识',
              render: (_: unknown, r) => (
                <Typography.Text code type="secondary" style={{ fontSize: 11 }}>
                  {taskV2Key(bizScope, r.taskKey, r.subtype)}
                </Typography.Text>
              ),
            },
            {
              title: '状态',
              width: 100,
              render: (_: unknown, r) => {
                const published = publishedTaskKeys.has(taskV2Key(bizScope, r.taskKey, r.subtype));
                return published ? <Tag color="green">已发布</Tag> : <Tag>未发布</Tag>;
              },
            },
            {
              title: '',
              width: 80,
              render: (_: unknown, r) => {
                const published = publishedTaskKeys.has(taskV2Key(bizScope, r.taskKey, r.subtype));
                return (
                  <Button
                    type="link"
                    size="small"
                    disabled={published}
                    onClick={() =>
                      openPublishBusiness(
                        bizScope,
                        r.taskKey,
                        r.subtype,
                        r.taskLabel || r.taskKey
                      )
                    }
                  >
                    发布
                  </Button>
                );
              },
            },
          ]}
        />
      </Modal>

      <Modal
        title={
          <span className="page-card-title-row">
            选择要发布的 Smartflow
            <PageHint
              title="发布条件"
              description="仅 active 状态的工作流可发布；须为你创建的工作流（Admin 可发布全部）。"
            />
          </span>
        }
        open={sfModalOpen}
        onCancel={() => setSfModalOpen(false)}
        footer={null}
        width={720}
      >
        <Table<SmartflowListItem>
          size="small"
          loading={sfLoading}
          rowKey="id"
          dataSource={flows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '名称', dataIndex: 'name', ellipsis: true },
            {
              title: 'ID',
              dataIndex: 'id',
              width: 120,
              ellipsis: true,
              render: (v: string) => (
                <Typography.Text code style={{ fontSize: 11 }}>
                  {v}
                </Typography.Text>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 88,
              render: (v: string) => <Tag>{v ?? '—'}</Tag>,
            },
            {
              title: '发布',
              width: 88,
              render: (_: unknown, r) => {
                const published = publishedSmartflowIds.has(r.id);
                return published ? <Tag color="green">已发布</Tag> : <Tag>未发布</Tag>;
              },
            },
            {
              title: '',
              width: 80,
              render: (_: unknown, r) => {
                const published = publishedSmartflowIds.has(r.id);
                return (
                  <Button
                    type="link"
                    size="small"
                    disabled={published || r.status !== 'active'}
                    onClick={() => openPublishSmartflow(r)}
                  >
                    发布
                  </Button>
                );
              },
            },
          ]}
        />
      </Modal>

      <PublishOpenApiDrawer
        open={publishDrawerOpen}
        onClose={() => {
          setPublishDrawerOpen(false);
          setPublishPreset(null);
        }}
        preset={publishPreset}
        onPublished={() => {
          refreshAll();
        }}
      />
    </>
  );

  if (embedded) {
    return (
      <div
        className={
          panel === 'stats'
            ? 'account-tab-pane account-tab-pane--scroll'
            : 'account-tab-pane account-tab-pane--fill'
        }
      >
        {panel === 'stats' ? statsTab : manageTab}
        {panel !== 'stats' ? publishModals : null}
      </div>
    );
  }

  return (
    <div className="page-card open-api-publish-page">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {pageCardTitle('API 发布', {
          title: '页面说明',
          description: '统一管理 Task V2 业务与 Smartflow 的对外 slug，查看第三方调用与 Token 消耗。',
        })}
      </Typography.Title>

      <Tabs
        className="open-api-publish-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        destroyOnHidden={false}
        items={[
          { key: 'manage', label: <span><UnorderedListOutlined /> 发布管理</span>, children: manageTab },
          { key: 'stats', label: <span><LineChartOutlined /> 用量统计</span>, children: statsTab },
          { key: 'partner', label: <span><BarChartOutlined /> Partner</span>, children: <PartnerAppsPanel /> },
        ]}
      />

      {publishModals}
    </div>
  );
}
