import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Select, Button, Space } from 'antd';
import { getAdminUsers, updateAdminUserStatus, adminForceLogout, type AdminUserItem } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { pageCardTitle } from '../components/PageHint';
import type { ColumnsType } from 'antd/es/table';

export default function Users() {
  const { isLoggedIn } = useAuth();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | 'user' | 'admin'>('');
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (overrides?: { page?: number }) => {
      if (!isLoggedIn) {
        setError('请先使用 Admin 账号登录');
        return;
      }
      const p = overrides?.page ?? page;
      setLoading(true);
      setError(null);
      const res = await getAdminUsers({
        page: p,
        limit,
        search: search.trim() || undefined,
        role: role || undefined,
      });
      setLoading(false);
      if (res.error) {
        setError(res.status === 403 ? '需要 Admin 权限' : res.error);
        return;
      }
      const body = res.data as { code?: number; data?: { users?: AdminUserItem[]; pagination?: { total: number; page: number; limit: number; totalPages: number } } };
      const data = body?.data;
      if (data?.users) setUsers(data.users);
      if (data?.pagination) {
        setTotal(data.pagination.total);
        if (overrides?.page != null) setPage(overrides.page);
      }
    },
    [isLoggedIn, page, limit, search, role]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = () => {
    setPage(1);
    fetchUsers({ page: 1 });
  };

  const handleStatus = async (userId: string, status: 'active' | 'suspended') => {
    setActionLoading(userId);
    const res = await updateAdminUserStatus(userId, status);
    setActionLoading(null);
    if (!res.error) fetchUsers();
    else setError(res.error);
  };

  const handleForceLogout = async (userId: string) => {
    setActionLoading(userId);
    const res = await adminForceLogout(userId);
    setActionLoading(null);
    if (!res.error) fetchUsers();
    else setError(res.error);
  };

  const columns: ColumnsType<AdminUserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120, ellipsis: true, render: (v: string) => v ?? '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 180, ellipsis: true, render: (v: string) => v ?? '-' },
    { title: '角色', dataIndex: 'role', key: 'role', width: 80, render: (v: string) => v ?? '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (v: string) => v ?? '-' },
    { title: '等级', dataIndex: 'level', key: 'level', width: 70, render: (v: number) => (v != null ? v : '-') },
    { title: '会员', dataIndex: 'membership_type', key: 'membership_type', width: 90, render: (v: string) => v ?? '-' },
    {
      title: '已登录',
      key: 'isLoggedIn',
      width: 80,
      render: (_, r) => (r.isLoggedIn ? '是' : '否'),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, r) => {
        const loading = actionLoading === r.id;
        return (
          <Space size="small" wrap>
            {r.status === 'active' ? (
              <Button
                size="small"
                danger
                disabled={actionLoading !== null || r.role === 'admin'}
                onClick={() => handleStatus(r.id, 'suspended')}
                loading={loading}
              >
                封禁
              </Button>
            ) : (
              <Button
                size="small"
                disabled={actionLoading !== null}
                onClick={() => handleStatus(r.id, 'active')}
                loading={loading}
              >
                解封
              </Button>
            )}
            <Button size="small" disabled={actionLoading !== null} onClick={() => handleForceLogout(r.id)} loading={loading}>
              强制登出
            </Button>
          </Space>
        );
      },
    },
  ];

  if (!isLoggedIn) {
    return (
      <div className="page-card">
        <h2>用户管理</h2>
        <p>请先使用 Admin 账号登录后再查看用户列表。</p>
      </div>
    );
  }

  return (
    <div className="page-card admin-users-page">
      <h2>
        {pageCardTitle('用户管理（Admin）', {
          title: '权限说明',
          description: '获取所有用户信息，需 Admin 权限。',
        })}
      </h2>

      <Space wrap size="middle" style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索用户名 / 邮箱 / 手机号"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          value={role}
          onChange={setRole}
          placeholder="全部角色"
          style={{ width: 120 }}
          options={[
            { value: '', label: '全部角色' },
            { value: 'user', label: 'user' },
            { value: 'admin', label: 'admin' },
          ]}
        />
        <Button type="primary" onClick={handleSearch} loading={loading}>
          查询
        </Button>
      </Space>

      {error && (
        <div className="admin-users-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="admin-users-table-wrap">
        <div className="admin-users-table-inner">
          <Table<AdminUserItem>
            columns={columns}
            dataSource={users}
            rowKey="id"
            loading={loading}
            size="small"
            scroll={{ x: 1000, y: 'calc(100vh - 300px)' }}
            pagination={{
              current: page,
              pageSize: limit,
              total,
              showSizeChanger: false,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p) => setPage(p),
            }}
          />
        </div>
      </div>
    </div>
  );
}
