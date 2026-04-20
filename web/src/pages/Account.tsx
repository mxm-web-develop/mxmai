import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd';
import {
  changeMyPassword,
  getMyWallet,
  getMyWalletTransactions,
  getAccountApiKeys,
  createAccountApiKey,
  deleteAccountApiKey,
  type WalletItem,
  type WalletTransaction,
  type AccountApiKeyItem,
  type CreateAccountApiKeyResult,
} from '../api/client';

const ASSET_CODE = 'MXM-TOKEN';

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

type WalletTxMetadata = {
  scope?: string;
  bizTag?: string;
  [key: string]: unknown;
};

export default function Account() {
  const { message } = App.useApp();
  const { user, isLoggedIn, logout } = useAuth();
  const [wallet, setWallet] = useState<WalletItem | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<AccountApiKeyItem[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false);
  const [createKeyName, setCreateKeyName] = useState('');
  const [createKeySubmitting, setCreateKeySubmitting] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<CreateAccountApiKeyResult | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordForm] = Form.useForm<PasswordFormValues>();

  const recentSpend = useMemo(() => {
    // 仅基于最近 10 条交易做一个轻量“本页概览”统计（后端若有更完整聚合接口可替换）
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

  if (!isLoggedIn) {
    return (
      <div className="page-card">
        <h2>账号中心</h2>
        <p className="muted">请先登录后查看账号信息与安全设置。</p>
      </div>
    );
  }

  const balanceValue = wallet ? Number(wallet.available_balance) : 0;

  return (
    <div className="page-card account-page">
      <div className="account-topbar">
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchBalance}>
            刷新用量
          </Button>
        </Space>
      </div>

      <div className="account-scroll">
        <div className="account-grid-top">
        <Card
          title="账号信息"
          styles={{ body: { paddingTop: 12 } }}
        >
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'username', label: '用户名', children: <Typography.Text strong>{user?.username ?? '—'}</Typography.Text> },
              { key: 'id', label: '用户 ID', children: <Typography.Text code>{user?.id ?? '—'}</Typography.Text> },
              { key: 'role', label: '角色', children: user?.role === 'admin' ? <Tag color="gold">管理员</Tag> : <Tag>普通用户</Tag> },
            ]}
          />
          <Divider style={{ marginBlock: 12 }} />
          <Alert
            type="info"
            showIcon
            message="提示"
            description="你的登录 Token 存在本地存储中。修改密码后系统会强制重新登录。"
          />
        </Card>

        <Card title="用量概览（MXM-TOKEN）" styles={{ body: { paddingTop: 12 } }}>
          <Spin spinning={loading}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <Statistic title="可用余额" value={balanceValue} precision={2} suffix="MXM" />
              <Statistic title="最近 10 条充值合计" value={recentSpend.deposited} precision={2} suffix="MXM" />
              <Statistic title="最近 10 条消费合计" value={recentSpend.spent} precision={2} suffix="MXM" />
              <Statistic title="资产代码" value={ASSET_CODE} />
            </div>
          </Spin>
        </Card>
      </div>

      <Divider style={{ marginBlock: 16 }} />

      <Card
        title="管理"
        styles={{ body: { paddingTop: 12 } }}
      >
        <TabsWithContent
          txs={txs}
          txLoading={loading}
          onRefreshUsage={fetchBalance}
          apiKeys={apiKeys}
          apiKeysLoading={apiKeysLoading}
          onRefreshApiKeys={fetchApiKeys}
          onOpenCreateKey={() => {
            setNewKeyResult(null);
            setCreateKeyName('');
            setCreateKeyModalOpen(true);
          }}
          onRevokeKey={async (id: string) => {
            if (!confirm('确定撤销该 API 密钥？撤销后无法恢复。')) return;
            const res = await deleteAccountApiKey(id);
            if (res.error) message.error(res.error);
            else {
              message.success('已撤销');
              fetchApiKeys();
            }
          }}
          passwordForm={passwordForm}
          passwordSubmitting={passwordSubmitting}
          onSubmitPassword={async (values: PasswordFormValues) => {
            setPasswordSubmitting(true);
            const res = await changeMyPassword({
              currentPassword: values.currentPassword,
              newPassword: values.newPassword,
            });
            setPasswordSubmitting(false);
            if (res.error) {
              message.error(res.error);
              return;
            }
            message.success('密码已更新，请重新登录');
            passwordForm.resetFields();
            logout();
          }}
        />
      </Card>

      <Modal
        title="创建 API 密钥"
        open={createKeyModalOpen && !newKeyResult}
        onCancel={() => setCreateKeyModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateKeyModalOpen(false)}>取消</Button>,
          <Button
            key="submit"
            type="primary"
            loading={createKeySubmitting}
            onClick={async () => {
              setCreateKeySubmitting(true);
              const res = await createAccountApiKey(createKeyName || undefined);
              setCreateKeySubmitting(false);
              if (res.error) {
                message.error(res.error);
                return;
              }
              const body = res.data as { data?: CreateAccountApiKeyResult };
              if (body?.data) setNewKeyResult(body.data);
            }}
          >
            创建
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 8 }}>
          <label>备注名（可选）</label>
          <Input
            value={createKeyName}
            onChange={(e) => setCreateKeyName(e.target.value)}
            placeholder="例如：OpenClaw / 本地脚本 / CI"
            style={{ marginTop: 4 }}
          />
        </div>
      </Modal>

      <Modal
        title="请妥善保存 API 密钥"
        open={!!newKeyResult}
        onCancel={() => {
          setNewKeyResult(null);
          setCreateKeyModalOpen(false);
          fetchApiKeys();
        }}
        footer={[
          <Space key="actions">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newKeyResult?.key ?? '');
                  message.success('已复制到剪贴板');
                } catch {
                  message.warning('复制失败，请手动复制');
                }
              }}
            >
              复制
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setNewKeyResult(null);
                setCreateKeyModalOpen(false);
                fetchApiKeys();
              }}
            >
              我已保存
            </Button>
          </Space>,
        ]}
        closable
      >
        <Alert
          type="warning"
          showIcon
          message="关闭后将无法再次查看，请立即复制保存。"
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea readOnly value={newKeyResult?.key ?? ''} rows={3} style={{ fontFamily: 'ui-monospace, monospace' }} />
      </Modal>
      </div>
    </div>
  );
}

type TabsWithContentProps = {
  txs: WalletTransaction[];
  txLoading: boolean;
  onRefreshUsage: () => void;
  apiKeys: AccountApiKeyItem[];
  apiKeysLoading: boolean;
  onRefreshApiKeys: () => void;
  onOpenCreateKey: () => void;
  onRevokeKey: (id: string) => Promise<void>;
  passwordForm: FormInstance<PasswordFormValues>;
  passwordSubmitting: boolean;
  onSubmitPassword: (values: PasswordFormValues) => Promise<void>;
};

function TabsWithContent(props: TabsWithContentProps) {
  const {
    txs,
    txLoading,
    onRefreshUsage,
    apiKeys,
    apiKeysLoading,
    onRefreshApiKeys,
    onOpenCreateKey,
    onRevokeKey,
    passwordForm,
    passwordSubmitting,
    onSubmitPassword,
  } = props;

  const txColumns: ColumnsType<WalletTransaction> = useMemo(() => {
    const cols: ColumnsType<WalletTransaction> = [
      {
        title: '时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (v: WalletTransaction['created_at']) => (v ? new Date(String(v)).toLocaleString('zh-CN') : '—'),
      },
      {
        title: '类型',
        dataIndex: 'type',
        key: 'type',
        width: 90,
        render: (v: WalletTransaction['type']) => (
          <Tag color={v === 'deposit' ? 'green' : 'red'}>{v === 'deposit' ? '充值' : '消费'}</Tag>
        ),
      },
      {
        title: '金额',
        dataIndex: 'amount',
        key: 'amount',
        width: 120,
        render: (v: WalletTransaction['amount'], r) => (
          <span style={{ color: r.type === 'deposit' ? '#16a34a' : '#dc2626' }}>
            {r.type === 'deposit' ? '+' : '-'}
            {Number(v).toFixed(2)}
          </span>
        ),
      },
      {
        title: '余额',
        dataIndex: 'balance_after',
        key: 'balance_after',
        width: 120,
        render: (v: WalletTransaction['balance_after']) => Number(v).toFixed(2),
      },
      {
        title: '备注',
        key: 'remark',
        render: (_: unknown, r) => {
          const meta = (r.metadata ?? null) as WalletTxMetadata | null;
          if (!meta) return '—';
          // 账号页只展示业务域（scope），不展示物理模型信息，避免噪音
          if (meta.scope) return String(meta.scope);
          if (meta.bizTag) return String(meta.bizTag);
          return '—';
        },
      },
    ];
    return cols;
  }, []);

  const apiKeyColumns: ColumnsType<AccountApiKeyItem> = useMemo(() => {
    const cols: ColumnsType<AccountApiKeyItem> = [
      { title: '前缀', dataIndex: 'key_prefix', key: 'key_prefix', width: 160, render: (v) => v || '—' },
      {
        title: '备注名',
        dataIndex: 'name',
        key: 'name',
        width: 160,
        render: (v) => v || <span className="muted">未命名</span>,
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (v) => (v ? new Date(String(v)).toLocaleString('zh-CN') : '—'),
      },
      {
        title: '最后使用',
        dataIndex: 'last_used_at',
        key: 'last_used_at',
        width: 180,
        render: (v) => (v ? new Date(String(v)).toLocaleString('zh-CN') : <span className="muted">从未</span>),
      },
      {
        title: '操作',
        key: 'action',
        width: 90,
        render: (_: unknown, r) => (
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => void onRevokeKey(r.id)}>
            撤销
          </Button>
        ),
      },
    ];
    return cols;
  }, [onRevokeKey]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Typography.Text className="muted">
          这里集中管理你的账号信息、安全设置、用量与 API Token。
        </Typography.Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
        <Card
          size="small"
          title="修改密码"
          styles={{ body: { paddingTop: 12 } }}
        >
          <Alert
            type="warning"
            showIcon
            message="修改密码后会自动退出登录"
            description="出于安全考虑，更新成功后会清理你的所有会话，需要重新登录。"
            style={{ marginBottom: 12 }}
          />
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={(values: PasswordFormValues) => onSubmitPassword(values)}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Form.Item
                label="当前密码"
                name="currentPassword"
                rules={[{ required: true, message: '请输入当前密码' }]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Form.Item
                label="新密码"
                name="newPassword"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 8, message: '至少 8 位' },
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                label="确认新密码"
                name="confirmNewPassword"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请再次输入新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                      return Promise.reject(new Error('两次输入不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </div>
            <Space>
              <Button type="primary" htmlType="submit" loading={props.passwordSubmitting}>
                更新密码
              </Button>
              <Button onClick={() => passwordForm.resetFields()} disabled={passwordSubmitting}>
                清空
              </Button>
            </Space>
          </Form>
        </Card>

        <Card
          size="small"
          title="用量与交易"
          styles={{ body: { paddingTop: 12 } }}
          extra={
            <Button size="small" icon={<ReloadOutlined />} loading={txLoading} onClick={onRefreshUsage}>
              刷新
            </Button>
          }
        >
          <Table<WalletTransaction>
            rowKey="id"
            size="small"
            loading={txLoading}
            dataSource={txs}
            pagination={false}
            columns={txColumns}
            locale={{ emptyText: '暂无交易记录' }}
          />
          <div className="muted" style={{ marginTop: 8 }}>
            当前仅展示最近 10 条记录（用于快速核对用量）。如需全量账单，可后续补“分页/筛选/导出”。
          </div>
        </Card>

        <Card
          size="small"
          title="API Token 管理"
          styles={{ body: { paddingTop: 12 } }}
          extra={
            <Space>
              <Button size="small" onClick={onRefreshApiKeys} loading={apiKeysLoading}>
                刷新
              </Button>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onOpenCreateKey}>
                创建 Token
              </Button>
            </Space>
          }
        >
          <Alert
            type="info"
            showIcon
            message="Token 用于脚本 / OpenClaw / CI 代表你调用平台接口"
            description="请勿泄露；建议按用途命名，定期撤销不再使用的 Token。"
            style={{ marginBottom: 12 }}
          />
          <Table<AccountApiKeyItem>
            rowKey="id"
            size="small"
            loading={apiKeysLoading}
            dataSource={apiKeys}
            pagination={false}
            columns={apiKeyColumns}
            locale={{ emptyText: '你还没有创建任何 Token' }}
          />
        </Card>
      </div>
    </div>
  );
}
