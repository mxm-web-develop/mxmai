import { useMemo, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppLang, toBcp47 } from '../i18n/appLocale';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  Modal,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  Radio,
  Select,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import BrandLoading from '../components/BrandLoading';
import { useAuth } from '../context/AuthContext';
import type { ColumnsType } from 'antd/es/table';
import {
  getMyWallet,
  getMyWalletTransactions,
  getAccountApiKeys,
  createAccountApiKey,
  deleteAccountApiKey,
  type WalletItem,
  type WalletTransaction,
  type AccountApiKeyItem,
  type CreateAccountApiKeyResult,
  type UserApiKeyType,
  type ApiKeyExpiresInDays,
} from '../api/client';
import { TABLE_SCROLL_Y_ACCOUNT } from '../utils/tableLayout';
import { AccountSecurityPanel } from '../components/account/AccountSecurityPanel';
import OpenApiPublish from './OpenApiPublish';
import { AccountUsagePanel } from '../components/AccountUsagePanel';
import { pageCardTitle } from '../components/PageHint';
import { IntegrationKeyPermissionsDrawer } from '../components/IntegrationKeyPermissionsDrawer';
import { downloadMxmAgentSkillZip } from '../lib/mxmAgentSkillBundle';
import { getGatewayHttpOrigin } from '../utils/gateway-ws';

const ASSET_CODE = 'MXM-TOKEN';



function defaultApiKeyExpiryDays(keyType: UserApiKeyType): ApiKeyExpiresInDays {
  return keyType === 'integration' ? 90 : 365;
}

function useApiKeyExpiryOptions() {
  const { t } = useTranslation();
  return useMemo(
    (): Array<{ value: ApiKeyExpiresInDays; label: string }> => [
      { value: 7, label: t('account.expiry.days7') },
      { value: 30, label: t('account.expiry.days30') },
      { value: 90, label: t('account.expiry.days90') },
      { value: 180, label: t('account.expiry.days180') },
      { value: 365, label: t('account.expiry.year1') },
      { value: 0, label: t('account.expiry.never') },
    ],
    [t]
  );
}

function formatApiKeyExpiry(
  expiresAt: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): ReactNode {
  if (!expiresAt) return <Tag>{t('account.expiry.never')}</Tag>;
  const exp = new Date(expiresAt);
  const msLeft = exp.getTime() - Date.now();
  if (msLeft <= 0) {
    return (
      <Tag color="red">
        {t('account.expiry.expired', { date: exp.toLocaleString(locale) })}
      </Tag>
    );
  }
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const text = exp.toLocaleString(locale);
  if (daysLeft <= 7) {
    return (
      <Tag color="orange">
        {t('account.expiry.daysLeft', { date: text, days: daysLeft })}
      </Tag>
    );
  }
  return text;
}

function formatExpirySummary(
  expiresAt: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): string {
  if (!expiresAt) return t('account.expiry.never');
  const exp = new Date(expiresAt);
  if (exp.getTime() <= Date.now()) return t('account.expiry.expiredSummary', { date: exp.toLocaleString(locale) });
  return t('account.expiry.expiresSummary', { date: exp.toLocaleString(locale) });
}

export default function Account() {
  const { t, i18n } = useTranslation();
  const API_KEY_EXPIRY_OPTIONS = useApiKeyExpiryOptions();
  const dateLocale = toBcp47(toAppLang(i18n.language));
  const { message, modal } = App.useApp();
  const { user, isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [wallet, setWallet] = useState<WalletItem | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<AccountApiKeyItem[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false);
  const [createKeyName, setCreateKeyName] = useState('');
  const [createKeyType, setCreateKeyType] = useState<UserApiKeyType>('personal');
  const [createKeyExpiresInDays, setCreateKeyExpiresInDays] = useState<ApiKeyExpiresInDays>(365);
  const [createKeySubmitting, setCreateKeySubmitting] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<CreateAccountApiKeyResult | null>(null);
  const [usageHighlightSlug, setUsageHighlightSlug] = useState<string | null>(null);
  const [usageInitialSource, setUsageInitialSource] = useState<'all' | 'web' | 'open_api'>('all');
  const [permDrawerOpen, setPermDrawerOpen] = useState(false);
  const [permDrawerKeyId, setPermDrawerKeyId] = useState<string | null>(null);
  const [permDrawerKeyName, setPermDrawerKeyName] = useState<string | null>(null);
  const [skillDownloadLoading, setSkillDownloadLoading] = useState(false);

  const handleDownloadAgentSkill = useCallback(async () => {
    setSkillDownloadLoading(true);
    try {
      await downloadMxmAgentSkillZip(getGatewayHttpOrigin());
      message.success(t('account.apiToken.skillDownloading'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('account.apiToken.downloadFailed'));
    } finally {
      setSkillDownloadLoading(false);
    }
  }, [message]);

  const recentSpend = useMemo(() => {
    const spent = txs
      .filter((t) => t.type !== 'deposit')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    const deposited = txs
      .filter((t) => t.type === 'deposit')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    return { spent, deposited };
  }, [txs]);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    const [walletRes, txRes] = await Promise.all([
      getMyWallet(ASSET_CODE),
      getMyWalletTransactions(ASSET_CODE, 10),
    ]);
    if (!walletRes.error && walletRes.data?.data) setWallet(walletRes.data.data);
    if (!txRes.error && txRes.data?.data) setTxs(txRes.data.data);
    setLoading(false);
  }, []);

  const fetchApiKeys = useCallback(async () => {
    setApiKeysLoading(true);
    const res = await getAccountApiKeys();
    if (!res.error && (res.data as { data?: AccountApiKeyItem[] })?.data) {
      setApiKeys((res.data as { data: AccountApiKeyItem[] }).data);
    }
    setApiKeysLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const t = window.setTimeout(() => {
      void fetchBalance();
      void fetchApiKeys();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isLoggedIn, fetchBalance, fetchApiKeys]);

  const handleRefresh = () => {
    if (activeTab === 'apiKeys') void fetchApiKeys();
    else void fetchBalance();
  };

  const apiKeyColumns: ColumnsType<AccountApiKeyItem> = useMemo(
    () => [
      { title: t('account.apiToken.prefix'), dataIndex: 'key_prefix', key: 'key_prefix', width: 160, render: (v) => v || '—' },
      {
        title: t('account.apiToken.type'),
        dataIndex: 'key_type',
        key: 'key_type',
        width: 140,
        render: (v: UserApiKeyType) =>
          v === 'integration' ? (
            <Tag color="purple">{t('account.apiToken.openApi')}</Tag>
          ) : (
            <Tag color="blue">{t('account.apiToken.personalAuto')}</Tag>
          ),
      },
      {
        title: t('account.apiToken.noteName'),
        dataIndex: 'name',
        key: 'name',
        width: 160,
        render: (v) => v || <span className="muted">{t('account.apiToken.unnamed')}</span>,
      },
      {
        title: t('account.apiToken.createdAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (v) => (v ? new Date(String(v)).toLocaleString('zh-CN') : '—'),
      },
      {
        title: t('account.apiToken.lastUsed'),
        dataIndex: 'last_used_at',
        key: 'last_used_at',
        width: 180,
        render: (v) =>
          v ? new Date(String(v)).toLocaleString(dateLocale) : <span className="muted">{t('account.apiToken.never')}</span>,
      },
      {
        title: t('account.apiToken.expiresAt'),
        dataIndex: 'expires_at',
        key: 'expires_at',
        width: 200,
        render: (v: string | null) => formatApiKeyExpiry(v, t, dateLocale),
      },
      {
        title: t('account.apiToken.actions'),
        key: 'action',
        width: 180,
        render: (_: unknown, r) => (
          <Space size={0}>
            {r.key_type === 'integration' && (
              <Button
                type="link"
                size="small"
                icon={<SafetyOutlined />}
                onClick={() => {
                  setPermDrawerKeyId(r.id);
                  setPermDrawerKeyName(r.name ?? null);
                  setPermDrawerOpen(true);
                }}
              >
                {t('account.apiToken.permissionsUsers')}
              </Button>
            )}
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => {
                modal.confirm({
                  title: t('account.apiToken.revokeTitle'),
                  content: t('account.apiToken.revokeContent'),
                  onOk: async () => {
                    const res = await deleteAccountApiKey(r.id);
                    if (res.error) message.error(res.error);
                    else {
                      message.success(t('account.apiToken.revoked'));
                      fetchApiKeys();
                    }
                  },
                });
              }}
            >
              {t('account.apiToken.revoke')}
            </Button>
          </Space>
        ),
      },
    ],
    [fetchApiKeys, message, modal]
  );

  if (!isLoggedIn) {
    return (
      <div className="page-card">
        <h2>{t('account.center')}</h2>
        <p className="muted">{t('account.pleaseLoginHint')}</p>
      </div>
    );
  }

  const balanceValue = wallet ? Number(wallet.available_balance) : 0;

  const tabItems = [
    {
      key: 'overview',
      label: t('account.tabs.overview'),
      children: (
        <div className="account-tab-pane account-tab-pane--scroll">
          <div className="account-identity-bar">
            <div className="account-identity-bar__avatar" aria-hidden>
              {(user?.username?.[0] || '?').toUpperCase()}
            </div>
            <div className="account-identity-bar__meta">
              <Typography.Text strong className="account-identity-bar__name">
                {user?.username ?? '—'}
              </Typography.Text>
              <Typography.Text type="secondary" className="account-identity-bar__id">
                {user?.id ?? '—'}
              </Typography.Text>
              <div className="account-identity-bar__tags">
                {user?.role === 'admin' ? (
                  <Tag color="gold">{t('account.overview.admin')}</Tag>
                ) : (
                  <Tag>{t('account.overview.regularUser')}</Tag>
                )}
              </div>
              <Space size={8} className="account-identity-bar__actions">
                <Button size="small" onClick={() => setActiveTab('security')}>
                  {t('account.overview.goSecurity')}
                </Button>
                <Button size="small" onClick={() => setActiveTab('apiKeys')}>
                  {t('account.overview.goApiToken')}
                </Button>
              </Space>
            </div>
          </div>
          <Card title={t('account.overview.usageOverview')} styles={{ body: { paddingTop: 12 } }}>
            <BrandLoading spinning={loading}>
              <div className="account-stats-grid">
                <Statistic title={t('account.overview.availableBalance')} value={balanceValue} precision={2} suffix="MXM" />
                <Statistic
                  title={t('account.overview.recentTopUp')}
                  value={recentSpend.deposited}
                  precision={2}
                  suffix="MXM"
                />
                <Statistic
                  title={t('account.overview.recentSpend')}
                  value={recentSpend.spent}
                  precision={2}
                  suffix="MXM"
                />
                <Statistic title={t('account.overview.assetCode')} value={ASSET_CODE} />
              </div>
            </BrandLoading>
          </Card>
        </div>
      ),
    },
    {
      key: 'security',
      label: t('account.tabs.security'),
      children: (
        <div className="account-tab-pane account-tab-pane--scroll">
          <AccountSecurityPanel />
        </div>
      ),
    },
    {
      key: 'usageStats',
      label: t('account.tabs.usage'),
      children: (
        <div className="account-tab-pane account-tab-pane--scroll">
          <AccountUsagePanel initialSource={usageInitialSource} highlightSlug={usageHighlightSlug} />
        </div>
      ),
    },
    {
      key: 'apiKeys',
      label: 'API Token',
      children: (
        <div className="account-tab-pane account-tab-pane--fill">
          <Card
            className="page-table-card"
            title={pageCardTitle(t('account.apiToken.title'), {
              title: t('account.apiToken.purpose'),
              description: (
              <>
                <p>{t('account.apiToken.purposeDesc1')}</p>
                <p style={{ marginTop: 8 }}>{t('account.apiToken.purposeDesc2')}</p>
                <p style={{ marginTop: 8 }}>{t('account.apiToken.purposeDesc3')}</p>
              </>
            ),
            })}
            extra={
              <Space>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  loading={skillDownloadLoading}
                  onClick={() => void handleDownloadAgentSkill()}
                >
                  {t('account.apiToken.downloadSkill')}
                </Button>
                <Button size="small" onClick={fetchApiKeys} loading={apiKeysLoading}>
                  {t('account.apiToken.refresh')}
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setNewKeyResult(null);
                    setCreateKeyName('');
                    setCreateKeyType('personal');
                    setCreateKeyExpiresInDays(defaultApiKeyExpiryDays('personal'));
                    setCreateKeyModalOpen(true);
                  }}
                >
                  {t('account.apiToken.create')}
                </Button>
              </Space>
            }
          >
            <div className="page-table-panel">
              <div className="page-table-wrap">
                <Table<AccountApiKeyItem>
                  rowKey="id"
                  size="small"
                  loading={apiKeysLoading}
                  dataSource={apiKeys}
                  pagination={false}
                  columns={apiKeyColumns}
                  scroll={{ x: 720, y: TABLE_SCROLL_Y_ACCOUNT }}
                  sticky
                  locale={{ emptyText: t('account.apiToken.empty') }}
                />
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: 'openApiManage',
      label: t('account.tabs.apiPublish'),
      children: (
        <OpenApiPublish
          embedded
          panel="manage"
          onOpenStats={(_id, slug) => {
            setUsageInitialSource('open_api');
            setUsageHighlightSlug(slug ?? null);
            setActiveTab('usageStats');
          }}
        />
      ),
    },
  ];

  return (
    <div className="page-card account-page">
      <div className="account-header">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('account.myAccountInfo')}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t('account.pageDesc')}
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading || apiKeysLoading} onClick={handleRefresh}>
          <span className="ui-label--full">{activeTab === 'apiKeys' ? t('account.refreshToken') : t('account.refreshData')}</span>
          <span className="ui-label--short">刷新</span>
        </Button>
      </div>

      <Tabs
        className="account-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        destroyOnHidden={false}
        items={tabItems}
      />

      <IntegrationKeyPermissionsDrawer
        open={permDrawerOpen}
        apiKeyId={permDrawerKeyId}
        apiKeyName={permDrawerKeyName}
        onClose={() => {
          setPermDrawerOpen(false);
          setPermDrawerKeyId(null);
          setPermDrawerKeyName(null);
        }}
      />

      <Modal
        title={t('account.apiToken.createTitle')}
        open={createKeyModalOpen && !newKeyResult}
        onCancel={() => setCreateKeyModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateKeyModalOpen(false)}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={createKeySubmitting}
            onClick={async () => {
              setCreateKeySubmitting(true);
              const res = await createAccountApiKey({
                name: createKeyName || undefined,
                keyType: createKeyType,
                expiresInDays: createKeyExpiresInDays,
              });
              setCreateKeySubmitting(false);
              if (res.error) {
                message.error(res.error);
                return;
              }
              const body = res.data as { data?: CreateAccountApiKeyResult };
              if (body?.data) setNewKeyResult(body.data);
            }}
          >
            {t('common.confirm')}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <label>{t('account.apiToken.keyType')}</label>
          <Radio.Group
            className="mt-1 flex flex-col gap-2"
            value={createKeyType}
            onChange={(e) => {
              const nextType = e.target.value as UserApiKeyType;
              setCreateKeyType(nextType);
              setCreateKeyExpiresInDays(defaultApiKeyExpiryDays(nextType));
            }}
          >
            <Radio value="personal">
              <span className="font-medium">{t('account.apiToken.personalCredential')}</span>
              <span className="block text-xs text-gray-500">
                {t('account.apiToken.personalDesc')}
              </span>
            </Radio>
            <Radio value="integration">
              <span className="font-medium">{t('account.apiToken.openApiClient')}</span>
              <span className="block text-xs text-gray-500">
                {t('account.apiToken.integrationDesc')}
              </span>
            </Radio>
          </Radio.Group>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>{t('account.apiToken.expiry')}</label>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={createKeyExpiresInDays}
            onChange={(v) => setCreateKeyExpiresInDays(v as ApiKeyExpiresInDays)}
            options={API_KEY_EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            {createKeyExpiresInDays === 0
              ? t('account.apiToken.expiryNeverHint')
              : createKeyType === 'integration'
                ? t('account.apiToken.expiryIntegrationHint')
                : t('account.apiToken.expiryDefaultHint')}
          </Typography.Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>{t('account.apiToken.noteOptional')}</label>
          <Input
            value={createKeyName}
            onChange={(e) => setCreateKeyName(e.target.value)}
            placeholder={
              createKeyType === 'integration'
                ? t('account.apiToken.noteIntegrationPlaceholder')
                : t('account.apiToken.notePersonalPlaceholder')
            }
            style={{ marginTop: 4 }}
          />
        </div>
      </Modal>

      <Modal
        title={t('account.apiToken.saveKeyTitle')}
        open={!!newKeyResult}
        onCancel={() => {
          setNewKeyResult(null);
          setCreateKeyModalOpen(false);
          fetchApiKeys();
        }}
        footer={[
          <Space key="actions">
            <Button
              icon={<DownloadOutlined />}
              loading={skillDownloadLoading}
              onClick={() => void handleDownloadAgentSkill()}
            >
              {t('account.apiToken.downloadSkill')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newKeyResult?.key ?? '');
                  message.success(t('account.apiToken.copied'));
                } catch {
                  message.warning('复制失败，请手动复制');
                }
              }}
            >
              {t('account.apiToken.copy')}
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setNewKeyResult(null);
                setCreateKeyModalOpen(false);
                fetchApiKeys();
              }}
            >
              {t('account.apiToken.savedConfirm')}
            </Button>
          </Space>,
        ]}
        closable
      >
        <Alert
          type="warning"
          showIcon
          title={t('account.apiToken.closeWarning')}
          style={{ marginBottom: 12 }}
        />
        {newKeyResult ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
            有效期：{formatExpirySummary(newKeyResult.expires_at ?? null, t, dateLocale)}
          </Typography.Paragraph>
        ) : null}
        <Input.TextArea
          readOnly
          value={newKeyResult?.key ?? ''}
          rows={3}
          style={{ fontFamily: 'ui-monospace, monospace' }}
        />
      </Modal>
    </div>
  );
}
