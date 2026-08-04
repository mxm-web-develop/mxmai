import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  LinkOutlined,
  ReloadOutlined,
  SafetyOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  addPartnerAllowlist,
  blockPartnerEndUser,
  createPartnerInvite,
  getPartnerAppByApiKeyId,
  getPartnerShareLink,
  listPartnerAllowlist,
  listPartnerAppEndUsers,
  listPartnerInvites,
  listPublishedApis,
  removePartnerAllowlist,
  revokePartnerInvite,
  unblockPartnerEndUser,
  updatePartnerAppSettings,
  type PartnerAllowlistItem,
  type PartnerAppItem,
  type PartnerEndUserItem,
  type PartnerInviteItem,
  type PublishedApiItem,
} from '../api/client';
import { PartnerAppUploadsPanel } from './PartnerAppUploadsPanel';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

const DEFAULT_H5_ORIGIN = import.meta.env.VITE_PARTNER_H5_ORIGIN ?? '';

type TabKey = 'slugs' | 'access' | 'users' | 'uploads';

type Props = {
  open: boolean;
  apiKeyId: string | null;
  apiKeyName?: string | null;
  onClose: () => void;
};

function formatIdentities(row: PartnerEndUserItem): string {
  if (row.identities?.length) {
    return row.identities.map((i) => `${i.provider}:${i.subject_masked}`).join(' · ');
  }
  return row.phone_masked ?? row.display_name ?? '—';
}

export function IntegrationKeyPermissionsDrawer({ open, apiKeyId, apiKeyName, onClose }: Props) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('slugs');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [app, setApp] = useState<PartnerAppItem | null>(null);
  const [publishedApis, setPublishedApis] = useState<PublishedApiItem[]>([]);
  const [endUsers, setEndUsers] = useState<PartnerEndUserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [allowlist, setAllowlist] = useState<PartnerAllowlistItem[]>([]);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [invites, setInvites] = useState<PartnerInviteItem[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [shareCopyText, setShareCopyText] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [slugAccessMode, setSlugAccessMode] = useState<'all_owner' | 'restricted'>('all_owner');
  const [endUserAccessMode, setEndUserAccessMode] = useState<'open' | 'whitelist'>('open');
  const [allowedSlugs, setAllowedSlugs] = useState<string[]>([]);
  const [h5LoginBaseUrl, setH5LoginBaseUrl] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const slugOptions = useMemo(
    () =>
      publishedApis
        .filter((a) => a.is_enabled)
        .map((a) => ({ value: a.slug, label: `${a.title} (${a.slug})` })),
    [publishedApis]
  );

  const loadApp = useCallback(async () => {
    if (!apiKeyId) return;
    setLoading(true);
    try {
      const [appRes, apisRes] = await Promise.all([
        getPartnerAppByApiKeyId(apiKeyId),
        listPublishedApis({ limit: 200 }),
      ]);
      if (appRes.error) throw new Error(appRes.error);
      const appData = appRes.data?.data;
      if (!appData) throw new Error(t('assets.openApi.loadPartnerFailed'));
      setApp(appData);
      setSlugAccessMode(appData.slugAccessMode ?? 'all_owner');
      setEndUserAccessMode(appData.endUserAccessMode ?? 'open');
      setAllowedSlugs(appData.allowedSlugs ?? []);
      setH5LoginBaseUrl(appData.h5LoginBaseUrl ?? DEFAULT_H5_ORIGIN);
      setUsersLoaded(false);

      const apis = apisRes.data?.data ?? (apisRes.data as { data?: PublishedApiItem[] })?.data ?? [];
      setPublishedApis(Array.isArray(apis) ? apis : []);
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('common.loadFailed') }));
    } finally {
      setLoading(false);
    }
  }, [apiKeyId, message]);

  const loadEndUsers = useCallback(async () => {
    if (!app?.id) return;
    setUsersLoading(true);
    try {
      const res = await listPartnerAppEndUsers(app.id, 30, 200);
      const body = res.data as { data?: PartnerEndUserItem[] } | undefined;
      setEndUsers(body?.data ?? []);
      setUsersLoaded(true);
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('assets.openApi.loadEndUsersFailed') }));
    } finally {
      setUsersLoading(false);
    }
  }, [app?.id, message]);

  const loadAllowlist = useCallback(async () => {
    if (!app?.id) return;
    setAllowlistLoading(true);
    try {
      const res = await listPartnerAllowlist(app.id);
      setAllowlist(res.data?.data ?? []);
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('assets.openApi.loadWhitelistFailed') }));
    } finally {
      setAllowlistLoading(false);
    }
  }, [app?.id, message]);

  const loadInvites = useCallback(async () => {
    if (!app?.id) return;
    setInvitesLoading(true);
    try {
      const res = await listPartnerInvites(app.id);
      setInvites(res.data?.data ?? []);
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('assets.openApi.loadInviteFailed') }));
    } finally {
      setInvitesLoading(false);
    }
  }, [app?.id, message]);

  const loadShareLink = useCallback(async () => {
    if (!app?.id) return;
    try {
      const res = await getPartnerShareLink(app.id);
      const data = res.data?.data;
      setShareUrl(data?.url ?? null);
      setShareCopyText(data?.copyText ?? data?.url ?? null);
    } catch {
      const base = (h5LoginBaseUrl || DEFAULT_H5_ORIGIN).replace(/\/$/, '');
      const url = base ? `${base}/login` : '/login';
      setShareUrl(url);
      setShareCopyText(t('assets.openApi.shareSmsLogin', { url }));
    }
  }, [app?.id, h5LoginBaseUrl]);

  useEffect(() => {
    if (open && apiKeyId) {
      setActiveTab('slugs');
      void loadApp();
    }
  }, [open, apiKeyId, loadApp]);

  useEffect(() => {
    if (!open || !app?.id) return;
    if (activeTab === 'users' && !usersLoaded) void loadEndUsers();
    if (activeTab === 'access') {
      if (endUserAccessMode === 'whitelist') {
        void loadAllowlist();
        void loadInvites();
      } else {
        void loadShareLink();
      }
    }
  }, [
    open,
    app?.id,
    activeTab,
    usersLoaded,
    endUserAccessMode,
    loadEndUsers,
    loadAllowlist,
    loadInvites,
    loadShareLink,
  ]);

  const handleSaveSettings = async () => {
    if (!app?.id) return;
    if (slugAccessMode === 'restricted' && allowedSlugs.length === 0) {
      message.warning(t('assets.openApi.selectSlugRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await updatePartnerAppSettings(app.id, {
        endUserAccessMode,
        slugAccessMode,
        allowedSlugs: slugAccessMode === 'restricted' ? allowedSlugs : [],
        h5LoginBaseUrl: h5LoginBaseUrl.trim() || null,
      });
      if (res.error) throw new Error(res.error);
      const updated = res.data?.data;
      if (updated) setApp(updated);
      message.success(t('assets.openApi.settingsSaved'));
      if (endUserAccessMode === 'whitelist' && activeTab === 'access') {
        void loadAllowlist();
        void loadInvites();
      }
      if (endUserAccessMode === 'open' && activeTab === 'access') {
        void loadShareLink();
      }
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('account.saveFailed') }));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!app?.id) return;
    setCreatingInvite(true);
    try {
      const res = await createPartnerInvite(app.id);
      if (res.error) throw new Error(res.error);
      const data = res.data?.data;
      const url = data?.url;
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
          message.success(t('assets.openApi.inviteCopied'));
        } catch {
          message.success(t('assets.openApi.inviteGenerated'));
          message.info(url);
        }
      } else {
        message.success(t('assets.openApi.inviteGenerated'));
      }
      void loadInvites();
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('common.submitFailed') }));
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyShareText = async () => {
    const text = shareCopyText ?? shareUrl;
    if (!text) {
      await loadShareLink();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('assets.openApi.shareCopied'));
    } catch {
      message.info(text);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!app?.id) return;
    const res = await revokePartnerInvite(app.id, inviteId);
    if (res.error) message.error(toUserFacingErrorMessage(res.error));
    else {
      message.success(t('assets.openApi.inviteRevoked'));
      void loadInvites();
    }
  };

  const handleAddPhone = async () => {
    if (!app?.id || !newPhone.trim()) return;
    const res = await addPartnerAllowlist(app.id, { provider: 'sms', subject: newPhone.trim() });
    if (res.error) {
      message.error(toUserFacingErrorMessage(res.error));
      return;
    }
    message.success(t('assets.openApi.addedWhitelist'));
    setNewPhone('');
    void loadAllowlist();
  };

  const endUserColumns: ColumnsType<PartnerEndUserItem> = [
    {
      title: t('assets.openApi.identity'),
      key: 'identity',
      ellipsis: true,
      render: (_: unknown, r) => formatIdentities(r),
    },
    {
      title: t('assets.openApi.status'),
      dataIndex: 'status',
      width: 88,
      render: (v: string) =>
        v === 'blocked' ? <Tag color="red">{t('assets.openApi.blocked')}</Tag> : <Tag color="green">{t('assets.openApi.normal')}</Tag>,
    },
    {
      title: t('assets.openApi.registeredAt'),
      dataIndex: 'created_at',
      width: 168,
      render: (v: string | undefined) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
    },
    {
      title: t('assets.openApi.callsLast30Days'),
      dataIndex: 'call_count',
      width: 96,
      align: 'right',
    },
    {
      title: t('assets.openApi.actions'),
      key: 'action',
      width: 72,
      fixed: 'right',
      render: (_: unknown, r) =>
        r.status === 'blocked' ? (
          <Button
            type="link"
            size="small"
            onClick={async () => {
              if (!app?.id) return;
              const res = await unblockPartnerEndUser(app.id, r.id);
              if (res.error) message.error(toUserFacingErrorMessage(res.error));
              else {
                message.success(t('assets.openApi.unblocked'));
                void loadEndUsers();
              }
            }}
          >
            {t('assets.openApi.unblock')}
          </Button>
        ) : (
          <Popconfirm
            title={t('assets.openApi.blockConfirm')}
            onConfirm={async () => {
              if (!app?.id) return;
              const res = await blockPartnerEndUser(app.id, r.id);
              if (res.error) message.error(toUserFacingErrorMessage(res.error));
              else {
                message.success(t('assets.openApi.blockedMsg'));
                void loadEndUsers();
              }
            }}
          >
            <Button type="link" danger size="small">
              {t('assets.openApi.block')}
            </Button>
          </Popconfirm>
        ),
    },
  ];

  const allowlistColumns: ColumnsType<PartnerAllowlistItem> = [
    { title: t('assets.openApi.provider'), dataIndex: 'provider', width: 72 },
    { title: t('assets.openApi.identifier'), dataIndex: 'subjectMasked', ellipsis: true },
    {
      title: t('assets.openApi.source'),
      dataIndex: 'source',
      width: 72,
      render: (v: string) => (v === 'invite' ? t('assets.openApi.sourceInvite') : t('assets.openApi.sourceManual')),
    },
    {
      title: t('assets.openApi.actions'),
      key: 'action',
      width: 64,
      render: (_: unknown, r) => (
        <Popconfirm
          title={t('assets.openApi.removeWhitelist')}
          onConfirm={async () => {
            if (!app?.id) return;
            const res = await removePartnerAllowlist(app.id, r.id);
            if (res.error) message.error(toUserFacingErrorMessage(res.error));
            else {
              message.success(t('assets.openApi.removed'));
              void loadAllowlist();
            }
          }}
        >
          <Button type="link" danger size="small">
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const userCountLabel =
    usersLoaded && endUsers.length > 0 ? t('assets.openApi.endUsersCount', { count: endUsers.length }) : t('assets.openApi.endUsersTab');

  const tabItems = [
    {
      key: 'slugs' as const,
      label: (
        <span>
          <UnorderedListOutlined /> 服务权限
        </span>
      ),
      children: (
        <Form layout="vertical" disabled={loading} className="perm-drawer-tab-pane">
          <Typography.Paragraph type="secondary" className="perm-drawer-tab-desc">
            限制该 Key 可调用的已发布 Open API slug；不限制时与账号下全部已发布服务一致。
          </Typography.Paragraph>
          <Form.Item label="Slug 访问模式">
            <Radio.Group
              value={slugAccessMode}
              onChange={(e) => setSlugAccessMode(e.target.value)}
            >
              <Space direction="vertical">
                <Radio value="all_owner">全部已发布服务（不限制）</Radio>
                <Radio value="restricted">仅指定 slug</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          {slugAccessMode === 'restricted' && (
            <Form.Item label="允许的 slug">
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="选择已发布的 Task / Smartflow slug"
                value={allowedSlugs}
                onChange={setAllowedSlugs}
                options={slugOptions}
                optionFilterProp="label"
              />
            </Form.Item>
          )}
          <Button type="primary" loading={saving} onClick={() => void handleSaveSettings()}>
            保存设置
          </Button>
        </Form>
      ),
    },
    {
      key: 'access' as const,
      label: (
        <span>
          <LinkOutlined /> 访问与白名单
        </span>
      ),
      children: (
        <Form layout="vertical" disabled={loading} className="perm-drawer-tab-pane">
          <Typography.Paragraph type="secondary" className="perm-drawer-tab-desc">
            开放模式下分享登录页文案即可；白名单模式下需为每位用户单独生成一次性邀请码。
          </Typography.Paragraph>
          <Form.Item label="注册模式">
            <Radio.Group
              value={endUserAccessMode}
              onChange={(e) => setEndUserAccessMode(e.target.value)}
            >
              <Space direction="vertical">
                <Radio value="open">开放注册（任意手机号可登录）</Radio>
                <Radio value="whitelist">白名单（仅名单内或邀请链接）</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="H5 登录页地址">
            <Input
              value={h5LoginBaseUrl}
              onChange={(e) => setH5LoginBaseUrl(e.target.value)}
              placeholder={DEFAULT_H5_ORIGIN || 'https://your-h5.example.com'}
            />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={() => void handleSaveSettings()}>
            保存设置
          </Button>

          {endUserAccessMode === 'open' && (
            <div className="perm-drawer-whitelist-block">
              <Typography.Title level={5}>分享文案</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                开放注册无需邀请码，复制下方文案或登录链接发给用户即可。
              </Typography.Paragraph>
              <Space wrap style={{ marginBottom: 12 }}>
                <Button type="primary" icon={<CopyOutlined />} onClick={() => void handleCopyShareText()}>
                  复制分享文案
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => void loadShareLink()}>
                  刷新
                </Button>
              </Space>
              {shareCopyText && (
                <Typography.Paragraph copyable={{ text: shareCopyText }} style={{ fontSize: 12 }}>
                  {shareCopyText}
                </Typography.Paragraph>
              )}
            </div>
          )}

          {endUserAccessMode === 'whitelist' && (
            <div className="perm-drawer-whitelist-block">
              <Typography.Title level={5}>白名单与邀请码</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                每位用户需单独生成邀请码（一码一人）。对方打开链接验证码登录后将自动加入白名单，码随即失效。
              </Typography.Paragraph>
              <Space wrap style={{ marginBottom: 12 }}>
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  loading={creatingInvite}
                  onClick={() => void handleCreateInvite()}
                >
                  生成邀请码
                </Button>
                <Button icon={<ReloadOutlined />} loading={invitesLoading} onClick={() => void loadInvites()}>
                  刷新列表
                </Button>
              </Space>
              <Table
                size="small"
                rowKey="id"
                loading={invitesLoading}
                dataSource={invites}
                pagination={{ pageSize: 5, showSizeChanger: false, size: 'small' }}
                style={{ marginBottom: 16 }}
                columns={[
                  {
                    title: t('assets.openApi.status'),
                    dataIndex: 'status',
                    width: 88,
                    render: (s: PartnerInviteItem['status']) => {
                      const map = {
                        pending: { color: 'processing', text: '待使用' },
                        used: { color: 'success', text: '已使用' },
                        revoked: { color: 'default', text: '已作废' },
                      } as const;
                      const item = map[s];
                      return <Tag color={item.color}>{item.text}</Tag>;
                    },
                  },
                  {
                    title: '使用者',
                    dataIndex: 'usedSubject',
                    render: (v: string | null) => v ?? '—',
                  },
                  {
                    title: '创建时间',
                    dataIndex: 'createdAt',
                    width: 160,
                    render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
                  },
                  {
                    title: t('assets.openApi.actions'),
                    key: 'actions',
                    width: 72,
                    render: (_: unknown, row: PartnerInviteItem) =>
                      row.status === 'pending' ? (
                        <Button type="link" size="small" danger onClick={() => void handleRevokeInvite(row.id)}>
                          作废
                        </Button>
                      ) : null,
                  },
                ]}
              />
              <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                <Input
                  placeholder="添加手机号到白名单"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onPressEnter={() => void handleAddPhone()}
                />
                <Button onClick={() => void handleAddPhone()}>添加</Button>
              </Space.Compact>
              <Table
                size="small"
                rowKey="id"
                loading={allowlistLoading}
                dataSource={allowlist}
                columns={allowlistColumns}
                pagination={{ pageSize: 8, showSizeChanger: false, size: 'small' }}
              />
            </div>
          )}
        </Form>
      ),
    },
    {
      key: 'users' as const,
      label: (
        <span>
          <TeamOutlined /> {userCountLabel}
        </span>
      ),
      children: (
        <div className="perm-drawer-tab-pane perm-drawer-users-pane">
          <div className="perm-drawer-users-toolbar">
            <Typography.Text type="secondary">
              通过短信或其他方式注册到该应用的终端用户，可封禁 / 解封。
            </Typography.Text>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={usersLoading}
              onClick={() => void loadEndUsers()}
            >
              刷新列表
            </Button>
          </div>
          <Table
            size="small"
            rowKey="id"
            loading={usersLoading}
            dataSource={endUsers}
            columns={endUserColumns}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `共 ${total} 人`,
              size: 'small',
            }}
            scroll={{ x: 560, y: 'calc(100vh - 280px)' }}
          />
        </div>
      ),
    },
    {
      key: 'uploads' as const,
      label: (
        <span>
          <CloudUploadOutlined /> 上传文件
        </span>
      ),
      children: app?.id ? (
        <PartnerAppUploadsPanel fixedPartnerAppId={app.id} embedded />
      ) : (
        <Typography.Text type="secondary">加载应用信息中…</Typography.Text>
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <SafetyOutlined />
          <span>权限与用户 · {apiKeyName || app?.name || 'Integration Key'}</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={760}
      destroyOnClose
      className="integration-key-perm-drawer"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => void loadApp()} loading={loading}>
          刷新
        </Button>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
        items={tabItems}
        className="perm-drawer-tabs"
      />
    </Drawer>
  );
}
