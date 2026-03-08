import { useState, useEffect, useCallback } from 'react';
import { Card, Statistic, Button, Table, Tag, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { getMyWallet, getMyWalletTransactions, type WalletItem, type WalletTransaction } from '../api/client';

const ASSET_CODE = 'MXM-TOKEN';

export default function Account() {
  const { user, isLoggedIn } = useAuth();
  const [wallet, setWallet] = useState<WalletItem | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (isLoggedIn) fetchBalance();
  }, [isLoggedIn, fetchBalance]);

  if (!isLoggedIn) {
    return (
      <div className="page-card">
        <h2>我的账号信息</h2>
        <p>请先登录后查看。</p>
      </div>
    );
  }

  return (
    <div className="page-card">
      <h2>我的账号信息</h2>
      <div style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: 16 }}>
          <p><strong>用户名</strong>：{user?.username ?? '—'}</p>
          <p><strong>用户 ID</strong>：{user?.id ?? '—'}</p>
          <p><strong>角色</strong>：{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
        </div>

        <Card
          size="small"
          title="MXM-TOKEN 余额"
          extra={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={fetchBalance}
            >
              刷新
            </Button>
          }
          style={{ marginBottom: 16 }}
        >
          <Spin spinning={loading}>
            <Statistic
              value={wallet ? Number(wallet.available_balance) : 0}
              suffix="MXM"
              precision={2}
            />
          </Spin>
        </Card>

        <Card size="small" title="最近消费记录（10条）">
          <Table<WalletTransaction>
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={txs}
            pagination={false}
            columns={[
              {
                title: '时间',
                dataIndex: 'created_at',
                key: 'created_at',
                width: 180,
                render: (v) => v ? new Date(v).toLocaleString('zh-CN') : '—',
              },
              {
                title: '类型',
                dataIndex: 'type',
                key: 'type',
                width: 80,
                render: (v) => (
                  <Tag color={v === 'deposit' ? 'green' : 'red'}>
                    {v === 'deposit' ? '充值' : '消费'}
                  </Tag>
                ),
              },
              {
                title: '金额',
                dataIndex: 'amount',
                key: 'amount',
                width: 100,
                render: (v, r) => (
                  <span style={{ color: r.type === 'deposit' ? '#52c41a' : '#ff4d4f' }}>
                    {r.type === 'deposit' ? '+' : '-'}{Number(v).toFixed(2)}
                  </span>
                ),
              },
              {
                title: '余额',
                dataIndex: 'balance_after',
                key: 'balance_after',
                width: 100,
                render: (v) => Number(v).toFixed(2),
              },
              {
                title: '备注',
                key: 'remark',
                render: (_, r) => {
                  const meta = r.metadata as any;
                  if (!meta) return '—';
                  if (meta.scope && meta.modelKey) return `${meta.scope} / ${meta.modelKey}`;
                  if (meta.bizTag) return meta.bizTag;
                  return '—';
                },
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
