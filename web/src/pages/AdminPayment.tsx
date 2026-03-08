import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Input, InputNumber, Modal, Form, Space, Tag, message } from 'antd';
import { useAuth } from '../context/AuthContext';
import {
  getAdminUsers,
  adminGetUserWallet,
  adminDepositToWallet,
  type AdminUserItem,
  type WalletItem,
} from '../api/client';

const ASSET_CODE = 'MXM-TOKEN';

interface UserWithBalance extends AdminUserItem {
  mxmBalance?: string;
  balanceLoading?: boolean;
}

export default function AdminPayment() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserWithBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositTarget, setDepositTarget] = useState<UserWithBalance | null>(null);
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositForm] = Form.useForm<{ amount: number; referenceId?: string; note?: string }>();

  const fetchUsers = useCallback(async (p = page, s = search) => {
    setLoading(true);
    const res = await getAdminUsers({ page: p, limit: 20, search: s || undefined });
    if (!res.error && res.data?.data?.users) {
      const list: UserWithBalance[] = res.data.data.users.map((u) => ({ ...u, mxmBalance: undefined }));
      setUsers(list);
      setTotal(res.data.data.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    if (isLoggedIn && isAdmin) fetchUsers(1, '');
  }, [isLoggedIn, isAdmin]);

  const loadBalance = async (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, balanceLoading: true } : u))
    );
    const res = await adminGetUserWallet(userId, ASSET_CODE);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              balanceLoading: false,
              mxmBalance: res.error ? '—' : (res.data?.data as WalletItem)?.available_balance ?? '0',
            }
          : u
      )
    );
  };

  const openDeposit = (user: UserWithBalance) => {
    setDepositTarget(user);
    depositForm.resetFields();
    setDepositModalOpen(true);
  };

  const handleDeposit = async () => {
    const values = await depositForm.validateFields().catch(() => null);
    if (!values || !depositTarget) return;
    setDepositSaving(true);
    const res = await adminDepositToWallet({
      userId: depositTarget.id,
      assetCode: ASSET_CODE,
      amount: String(values.amount),
      referenceId: values.referenceId || undefined,
      metadata: values.note ? { note: values.note } : undefined,
    });
    setDepositSaving(false);
    if (res.error) {
      message.error(`充值失败：${res.error}`);
      return;
    }
    message.success(`已成功充值 ${values.amount} MXM-TOKEN 给用户 ${depositTarget.username}`);
    setDepositModalOpen(false);
    setDepositTarget(null);
    // Refresh balance for this user
    loadBalance(depositTarget.id);
  };

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>支付管理</h2>
        <p>请先使用 Admin 账号登录后再查看。</p>
      </div>
    );
  }

  return (
    <div className="page-card">
      <h2>支付管理</h2>
      <Card size="small" title="用户 MXM-TOKEN 余额管理">
        <Space style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="搜索用户名或邮箱"
            allowClear
            style={{ width: 260 }}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
              fetchUsers(1, v);
            }}
          />
          <Button
            onClick={() => fetchUsers(page, search)}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
        <Table<UserWithBalance>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={users}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            onChange: (p) => {
              setPage(p);
              fetchUsers(p, search);
            },
          }}
          columns={[
            {
              title: '用户名',
              dataIndex: 'username',
              key: 'username',
              width: 140,
            },
            {
              title: '用户 ID',
              dataIndex: 'id',
              key: 'id',
              width: 280,
              render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
            },
            {
              title: '角色',
              dataIndex: 'role',
              key: 'role',
              width: 80,
              render: (v) => (
                <Tag color={v === 'admin' ? 'blue' : 'default'}>
                  {v === 'admin' ? '管理员' : '普通用户'}
                </Tag>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 80,
              render: (v) => (
                <Tag color={v === 'active' ? 'green' : 'red'}>{v ?? '—'}</Tag>
              ),
            },
            {
              title: 'MXM-TOKEN 余额',
              key: 'mxmBalance',
              width: 160,
              render: (_, r) => {
                if (r.balanceLoading) return '加载中…';
                if (r.mxmBalance !== undefined) {
                  return <strong>{Number(r.mxmBalance).toFixed(2)}</strong>;
                }
                return (
                  <Button size="small" type="link" onClick={() => loadBalance(r.id)}>
                    查看余额
                  </Button>
                );
              },
            },
            {
              title: '操作',
              key: 'actions',
              width: 120,
              render: (_, row) => (
                <Button size="small" type="primary" onClick={() => openDeposit(row)}>
                  充值
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={`充值 MXM-TOKEN → ${depositTarget?.username ?? ''}`}
        open={depositModalOpen}
        onOk={handleDeposit}
        confirmLoading={depositSaving}
        onCancel={() => {
          setDepositModalOpen(false);
          setDepositTarget(null);
        }}
        okText="确认充值"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={depositForm} layout="vertical">
          <Form.Item
            name="amount"
            label="充值金额（MXM-TOKEN）"
            rules={[{ required: true, message: '请输入充值金额' }, { type: 'number', min: 0.01, message: '金额必须大于 0' }]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="如 100" />
          </Form.Item>
          <Form.Item name="referenceId" label="参考单号（可选）">
            <Input placeholder="如支付订单号" />
          </Form.Item>
          <Form.Item name="note" label="备注（可选）">
            <Input placeholder="如 Admin 手动充值" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
