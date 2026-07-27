import { useCallback, useEffect, useMemo, useState } from 'react';
import { Column, Pie } from '@ant-design/charts';
import {
  App,
  Badge,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import BrandLoading from '../components/BrandLoading';
import type { ColumnsType } from 'antd/es/table';
import {
  adminCreateUser,
  adminDepositToWallet,
  adminForceLogout,
  adminGetUserWallet,
  cancelTask,
  getAdminStats,
  getAdminTasks,
  getAdminUsers,
  recoverTask,
  retryTask,
  updateAdminUserStatus,
  type AdminStatsData,
  type AdminTaskItem,
  type AdminUserItem,
  type WalletItem,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import AdminAgentConfig from './AdminAgentConfig';

const MXM_ASSET_CODE = 'MXM-TOKEN';

const DARK_THEME = {
  defaultColor: '#5B8FF9',
  style: {
    axisLabelFill: '#e0e0e0',
    axisTitleFill: '#e0e0e0',
    legendLabelFill: '#e0e0e0',
    labelFill: '#e0e0e0',
    titleFill: '#e0e0e0',
  },
};

const PIE_COLORS = ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9845'];

function recordToPieData(record: Record<string, number>): { type: string; value: number }[] {
  return Object.entries(record).map(([type, value]) => ({ type, value }));
}

function getStatusBadge(status: string) {
  const map: Record<string, { color: 'default' | 'processing' | 'success' | 'error' | 'warning'; text: string }> = {
    pending: { color: 'default', text: 'pending' },
    queued: { color: 'processing', text: 'queued' },
    processing: { color: 'processing', text: 'processing' },
    completed: { color: 'success', text: 'completed' },
    failed: { color: 'error', text: 'failed' },
    cancelled: { color: 'default', text: 'cancelled' },
    network_error: { color: 'warning', text: 'network_error' },
  };
  const v = map[status] ?? { color: 'default', text: status || '-' };
  return <Badge status={v.color} text={v.text} />;
}

export default function AdminOps() {
  const { message, modal } = App.useApp();
  const { isLoggedIn, isAdmin } = useAuth();

  // -------- Overview (stats) --------
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const topLimit = 10;

  const fetchStats = useCallback(async () => {
    if (!isLoggedIn || !isAdmin) {
      setStatsError('需要 Admin 权限');
      return;
    }
    setStatsLoading(true);
    setStatsError(null);
    const res = await getAdminStats({ days, topLimit });
    setStatsLoading(false);
    if (res.error) {
      setStatsError(res.status === 403 ? '需要 Admin 权限' : res.error);
      return;
    }
    const body = res.data as { success?: boolean; data?: AdminStatsData } | AdminStatsData;
    const statsData = body && typeof body === 'object' && 'data' in body ? body.data : (body as AdminStatsData);
    if (statsData && typeof statsData === 'object') setStats(statsData);
  }, [days, isAdmin, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    const t = window.setTimeout(() => void fetchStats(), 0);
    return () => window.clearTimeout(t);
  }, [fetchStats, isAdmin, isLoggedIn]);

  const dailyChartData = useMemo(() => {
    if (!stats?.dailyUsage?.length) return [];
    return [...stats.dailyUsage].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  }, [stats]);

  const statusPieData = useMemo(
    () => (stats?.taskCountByStatus ? recordToPieData(stats.taskCountByStatus) : []),
    [stats],
  );

  const typePieData = useMemo(
    () => (stats?.taskCountByType ? recordToPieData(stats.taskCountByType) : []),
    [stats],
  );

  const columnChartConfig = useMemo(
    () => ({
      data: dailyChartData,
      xField: 'date',
      yField: 'count',
      height: 300,
      theme: DARK_THEME,
      xAxis: {
        label: {
          autoRotate: true,
          style: { fill: '#e0e0e0', fontSize: 12 },
          formatter: (v: string) => (v && v.length >= 10 ? v.slice(5, 10) : v),
        },
      },
      yAxis: {
        label: { style: { fill: '#e0e0e0', fontSize: 12 } },
      },
      animation: { appear: { duration: 350 } },
    }),
    [dailyChartData],
  );

  const pieConfig = useCallback((data: { type: string; value: number }[]) => ({
    data,
    angleField: 'value',
    colorField: 'type',
    color: PIE_COLORS,
    radius: 0.86,
    innerRadius: 0.52,
    height: 300,
    theme: DARK_THEME,
    legend: false,
    label: false,
    tooltip: {
      title: 'type',
      items: [{ field: 'value', name: '任务数' }],
    },
    animation: { appear: { duration: 350 } },
  }), []);

  // -------- Tasks monitor --------
  const [tasks, setTasks] = useState<AdminTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [userId, setUserId] = useState('');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!isLoggedIn || !isAdmin) {
      setTasksError('需要 Admin 权限');
      return;
    }
    setTasksLoading(true);
    setTasksError(null);
    const res = await getAdminTasks({
      type: type || undefined,
      status: status || undefined,
      userId: userId.trim() || undefined,
      limit,
      offset,
    });
    setTasksLoading(false);
    if (res.error) {
      setTasksError(res.status === 403 ? '需要 Admin 权限' : res.error);
      return;
    }
    const body = res.data as { success?: boolean; data?: { tasks: AdminTaskItem[]; total: number } };
    const data = body?.data;
    if (data?.tasks) setTasks(data.tasks);
    if (data?.total != null) setTotal(data.total);
  }, [isAdmin, isLoggedIn, limit, offset, status, type, userId]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    const t = window.setTimeout(() => void fetchTasks(), 0);
    return () => window.clearTimeout(t);
  }, [fetchTasks, isAdmin, isLoggedIn]);

  const handleAction = async (taskId: string, action: 'cancel' | 'recover' | 'retry') => {
    setActionLoading(taskId);
    const fn = action === 'cancel' ? cancelTask : action === 'recover' ? recoverTask : retryTask;
    const res = await fn(taskId);
    setActionLoading(null);
    if (!res.error) void fetchTasks();
    else setTasksError(res.error);
  };

  const tasksColumns: ColumnsType<AdminTaskItem> = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      key: 'id',
      width: 180,
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <span>{id}</span>
        </Tooltip>
      ),
    },
    { title: '类型', dataIndex: 'type', key: 'type', width: 92, render: (v: string) => v ?? '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 132,
      render: (v: string) => getStatusBadge(v),
    },
    { title: 'Provider', key: 'provider', width: 110, render: (_, r) => r.metadata?.provider ?? '-' },
    {
      title: '模型',
      key: 'model',
      width: 180,
      ellipsis: true,
      render: (_, r) => {
        const v = r.metadata?.model ?? '-';
        return typeof v === 'string' && v.length > 24 ? (
          <Tooltip title={v}>
            <span>{v}</span>
          </Tooltip>
        ) : (
          v
        );
      },
    },
    {
      title: '用户',
      key: 'user',
      width: 150,
      ellipsis: true,
      render: (_, r) => {
        const name = r.metadata?.userName ?? r.metadata?.userId ?? '-';
        const uid = r.metadata?.userId;
        return uid ? (
          <Tooltip title={`用户 ID: ${uid}`}>
            <span>{name}</span>
          </Tooltip>
        ) : (
          name
        );
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => (v ? new Date(v).toLocaleString() : '-') },
    {
      title: '错误',
      key: 'error',
      width: 220,
      ellipsis: true,
      render: (_, r) => {
        const err =
          r.status === 'failed' || r.status === 'network_error' || r.progress?.error
            ? r.progress?.error || '无详细错误'
            : '';
        return err ? <span style={{ color: 'var(--admin-tasks-error-color, #f87171)' }}>{err}</span> : '—';
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_, r) => {
        const loading = actionLoading === r.id;
        const disabledAll = actionLoading !== null;
        const canCancel = ['pending', 'queued', 'processing'].includes(r.status);
        const canRecover = r.status === 'processing';
        const canRetry = ['failed', 'processing'].includes(r.status);
        return (
          <span className="actions-cell">
            {canCancel && (
              <button
                type="button"
                className={'act-btn act-btn--neutral' + (disabledAll ? ' act-btn--muted' : '')}
                disabled={disabledAll}
                onClick={() => handleAction(r.id, 'cancel')}
              >
                {loading && canCancel ? '…' : '取消'}
              </button>
            )}
            {canRecover && (
              <button
                type="button"
                className={'act-btn act-btn--neutral' + (disabledAll ? ' act-btn--muted' : '')}
                disabled={disabledAll}
                onClick={() => handleAction(r.id, 'recover')}
              >
                恢复
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                className={'act-btn act-btn--neutral' + (disabledAll ? ' act-btn--muted' : '')}
                disabled={disabledAll}
                onClick={() => handleAction(r.id, 'retry')}
              >
                重试
              </button>
            )}
          </span>
        );
      },
    },
  ];

  // -------- Users --------
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const usersLimit = 20;
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRole, setUsersRole] = useState<'' | 'user' | 'admin'>('');
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [mxmBalances, setMxmBalances] = useState<Record<string, string>>({});
  const [balanceLoadingId, setBalanceLoadingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm] = Form.useForm<{
    username: string;
    password: string;
    email?: string;
    phone?: string;
    role: 'user' | 'admin';
    membership_type: 'free' | 'pro' | 'premium';
  }>();

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositTarget, setDepositTarget] = useState<AdminUserItem | null>(null);
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositForm] = Form.useForm<{ amount: number; note?: string }>();

  const fetchUsers = useCallback(async (overrides?: { page?: number }) => {
    if (!isLoggedIn || !isAdmin) {
      setUsersError('需要 Admin 权限');
      return;
    }
    const p = overrides?.page ?? usersPage;
    setUsersLoading(true);
    setUsersError(null);
    const res = await getAdminUsers({
      page: p,
      limit: usersLimit,
      search: usersSearch.trim() || undefined,
      role: usersRole || undefined,
    });
    setUsersLoading(false);
    if (res.error) {
      setUsersError(res.status === 403 ? '需要 Admin 权限' : res.error);
      return;
    }
    const body = res.data as { code?: number; data?: { users?: AdminUserItem[]; pagination?: { total: number; page: number; limit: number; totalPages: number } } };
    const data = body?.data;
    if (data?.users) setUsers(data.users);
    if (data?.pagination) {
      setUsersTotal(data.pagination.total);
      if (overrides?.page != null) setUsersPage(overrides.page);
    }
  }, [isAdmin, isLoggedIn, usersLimit, usersPage, usersRole, usersSearch]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    const t = window.setTimeout(() => void fetchUsers(), 0);
    return () => window.clearTimeout(t);
  }, [fetchUsers, isAdmin, isLoggedIn]);

  const loadMxmBalance = async (userId: string) => {
    setBalanceLoadingId(userId);
    const res = await adminGetUserWallet(userId, MXM_ASSET_CODE);
    setBalanceLoadingId(null);
    if (res.error) {
      message.error(`读取余额失败：${res.error}`);
      return;
    }
    const bal = (res.data?.data as WalletItem | undefined)?.available_balance ?? '0';
    setMxmBalances((prev) => ({ ...prev, [userId]: bal }));
  };

  const handleUserStatus = (userId: string, status: 'active' | 'suspended', username?: string) => {
    const isDisable = status === 'suspended';
    modal.confirm({
      title: isDisable ? '确认禁用用户？' : '确认启用用户？',
      content: isDisable
        ? `禁用后「${username || userId}」将无法登录，且现有会话会被强制登出。`
        : `启用后「${username || userId}」可重新登录使用。`,
      okText: isDisable ? '确认禁用' : '确认启用',
      okButtonProps: isDisable ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: async () => {
        setUserActionLoading(userId);
        const res = await updateAdminUserStatus(userId, status);
        setUserActionLoading(null);
        if (!res.error) {
          message.success(isDisable ? '用户已禁用' : '用户已启用');
          void fetchUsers();
        } else {
          setUsersError(res.error);
          message.error(res.error);
        }
      },
    });
  };

  const handleUserForceLogout = async (userId: string) => {
    setUserActionLoading(userId);
    const res = await adminForceLogout(userId);
    setUserActionLoading(null);
    if (!res.error) {
      message.success('已强制登出');
      void fetchUsers();
    } else {
      setUsersError(res.error);
      message.error(res.error);
    }
  };

  const openCreateUser = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ role: 'user', membership_type: 'free' });
    setCreateOpen(true);
  };

  const handleCreateUser = async () => {
    const values = await createForm.validateFields().catch(() => null);
    if (!values) return;
    if (!values.email?.trim() && !values.phone?.trim()) {
      message.error('请至少填写邮箱或手机号');
      return;
    }
    setCreateSaving(true);
    const res = await adminCreateUser({
      username: values.username.trim(),
      password: values.password,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      role: values.role,
      membership_type: values.membership_type,
    });
    setCreateSaving(false);
    if (res.error) {
      message.error(`创建失败：${res.error}`);
      return;
    }
    message.success(`用户「${values.username}」已创建`);
    setCreateOpen(false);
    void fetchUsers({ page: 1 });
  };

  const openDeposit = (user: AdminUserItem) => {
    setDepositTarget(user);
    depositForm.resetFields();
    setDepositOpen(true);
    if (mxmBalances[user.id] == null) void loadMxmBalance(user.id);
  };

  const handleDeposit = async () => {
    const values = await depositForm.validateFields().catch(() => null);
    if (!values || !depositTarget) return;
    setDepositSaving(true);
    const res = await adminDepositToWallet({
      userId: depositTarget.id,
      assetCode: MXM_ASSET_CODE,
      amount: String(values.amount),
      metadata: values.note ? { note: values.note, source: 'admin_ops' } : { source: 'admin_ops' },
    });
    setDepositSaving(false);
    if (res.error) {
      message.error(`发放失败：${res.error}`);
      return;
    }
    message.success(`已向「${depositTarget.username}」发放 ${values.amount} MXM-TOKEN`);
    setDepositOpen(false);
    setDepositTarget(null);
    void loadMxmBalance(depositTarget.id);
  };

  const usersColumns: ColumnsType<AdminUserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 140, ellipsis: true, render: (v: string) => v ?? '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 200, ellipsis: true, render: (v: string) => v ?? '-' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'admin' ? 'blue' : 'default'}>{v === 'admin' ? '管理员' : '用户'}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => {
        const active = !v || v === 'active';
        return <Tag color={active ? 'green' : 'red'}>{active ? '正常' : v === 'suspended' ? '已禁用' : v}</Tag>;
      },
    },
    { title: '等级', dataIndex: 'level', key: 'level', width: 70, render: (v: number) => (v != null ? v : '-') },
    { title: '会员', dataIndex: 'membership_type', key: 'membership_type', width: 90, render: (v: string) => v ?? '-' },
    {
      title: 'MXM-TOKEN',
      key: 'mxm',
      width: 130,
      render: (_: unknown, r) => {
        if (balanceLoadingId === r.id) return '…';
        if (mxmBalances[r.id] != null) {
          return <strong>{Number(mxmBalances[r.id]).toLocaleString()}</strong>;
        }
        return (
          <Button type="link" size="small" onClick={() => void loadMxmBalance(r.id)}>
            查看
          </Button>
        );
      },
    },
    { title: '已登录', key: 'isLoggedIn', width: 80, render: (_: unknown, r) => (r.isLoggedIn ? '是' : '否') },
    { title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: (v: string) => (v ? new Date(v).toLocaleString() : '-') },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_: unknown, r) => {
        const loading = userActionLoading === r.id;
        const status = r.status ?? 'active';
        const disabledAll = userActionLoading !== null;
        return (
          <span className="actions-cell">
            <button
              type="button"
              className={'act-btn act-btn--primary' + (disabledAll ? ' act-btn--muted' : '')}
              disabled={disabledAll}
              onClick={() => openDeposit(r)}
            >
              发放 Token
            </button>
            {status === 'active' ? (
              <button
                type="button"
                className={
                  'act-btn act-btn--danger' +
                  (disabledAll || r.role === 'admin' ? ' act-btn--muted' : '')
                }
                disabled={disabledAll || r.role === 'admin'}
                onClick={() => handleUserStatus(r.id, 'suspended', r.username)}
              >
                {loading ? '…' : '禁用'}
              </button>
            ) : (
              <button
                type="button"
                className={'act-btn act-btn--success' + (disabledAll ? ' act-btn--muted' : '')}
                disabled={disabledAll}
                onClick={() => handleUserStatus(r.id, 'active', r.username)}
              >
                {loading ? '…' : '启用'}
              </button>
            )}
            <button
              type="button"
              className={'act-btn act-btn--neutral' + (disabledAll ? ' act-btn--muted' : '')}
              disabled={disabledAll}
              onClick={() => void handleUserForceLogout(r.id)}
            >
              强制登出
            </button>
          </span>
        );
      },
    },
  ];

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>系统管理</h2>
        <p>仅 Admin 可查看与配置。请使用管理员账号登录。</p>
      </div>
    );
  }

  return (
    <div className="page-card admin-ops-page">

      <div className="admin-providers-content-wrap">
        <div className="admin-providers-content-inner">
          <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: '系统概览',
            children: (
              <div className="admin-ops-section">
                <Card
                  size="small"
                  className="admin-ops-card"
                  title="核心指标"
                  extra={
                    <Space className="admin-ops-card-toolbar" size={8} wrap>
                      <span className="muted">每日用量天数</span>
                      <Select
                        value={days}
                        onChange={setDays}
                        style={{ width: 120 }}
                        options={[
                          { value: 7, label: '7 天' },
                          { value: 14, label: '14 天' },
                          { value: 30, label: '30 天' },
                          { value: 60, label: '60 天' },
                          { value: 90, label: '90 天' },
                        ]}
                      />
                      <Button type="primary" size="small" onClick={() => void fetchStats()} loading={statsLoading}>
                        刷新
                      </Button>
                    </Space>
                  }
                >
                  {statsError && <div className="admin-ops-error">{statsError}</div>}
                  {statsLoading && !stats ? (
                    <div className="admin-ops-loading">
                      <BrandLoading size="large" tip="加载中…" />
                    </div>
                  ) : (
                    <div className="admin-ops-kpis">
                      <Card size="small" className="admin-ops-kpi">
                        <Statistic title="用户总数" value={stats?.userCount ?? 0} />
                      </Card>
                      <Card size="small" className="admin-ops-kpi">
                        <Statistic title="任务总数" value={stats?.taskCount ?? 0} />
                      </Card>
                      <Card size="small" className="admin-ops-kpi">
                        <Statistic title="近 24h 任务" value={(stats?.dailyUsage ?? []).slice(-1)?.[0]?.count ?? 0} />
                      </Card>
                    </div>
                  )}
                </Card>

                <div className="admin-ops-grid">
                  <Card size="small" className="admin-ops-card" title="每日任务用量">
                    {dailyChartData.length > 0 ? (
                      <Column {...columnChartConfig} />
                    ) : (
                      <div className="muted">暂无数据</div>
                    )}
                  </Card>
                  <Card size="small" className="admin-ops-card" title="任务分布">
                    <div className="admin-ops-pies">
                      <div className="admin-ops-pie">
                        <div className="muted" style={{ marginBottom: 8 }}>按状态</div>
                        {statusPieData.length > 0 ? <Pie {...pieConfig(statusPieData)} /> : <div className="muted">暂无数据</div>}
                      </div>
                      <div className="admin-ops-pie">
                        <div className="muted" style={{ marginBottom: 8 }}>按类型</div>
                        {typePieData.length > 0 ? <Pie {...pieConfig(typePieData)} /> : <div className="muted">暂无数据</div>}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            key: 'tasks',
            label: '任务监控',
            children: (
              <div className="admin-ops-section">
                <Card
                  size="small"
                  className="admin-ops-card"
                  title="任务列表"
                  extra={
                    <Space className="admin-ops-card-toolbar" wrap size={8}>
                      <Input
                        placeholder="用户 ID"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        style={{ width: 180 }}
                        allowClear
                      />
                      <Select
                        value={type}
                        onChange={(v) => { setOffset(0); setType(v); }}
                        placeholder="全部类型"
                        style={{ width: 160 }}
                        options={[
                          { value: '', label: '全部类型' },
                          { value: 'writing', label: 'writing' },
                          { value: 'graph', label: 'graph' },
                          { value: 'video', label: 'video' },
                          { value: 'audio', label: 'audio' },
                          { value: 'graph-grid9-parent', label: 'graph-grid9-parent' },
                          { value: 'video-batch-parent', label: 'video-batch-parent' },
                          { value: 'other', label: 'other' },
                        ]}
                      />
                      <Select
                        value={status}
                        onChange={(v) => { setOffset(0); setStatus(v); }}
                        placeholder="全部状态"
                        style={{ width: 150 }}
                        options={[
                          { value: '', label: '全部状态' },
                          { value: 'pending', label: 'pending' },
                          { value: 'queued', label: 'queued' },
                          { value: 'processing', label: 'processing' },
                          { value: 'completed', label: 'completed' },
                          { value: 'failed', label: 'failed' },
                          { value: 'cancelled', label: 'cancelled' },
                          { value: 'network_error', label: 'network_error' },
                        ]}
                      />
                      <Button type="primary" size="small" onClick={() => { setOffset(0); void fetchTasks(); }} loading={tasksLoading}>
                        查询
                      </Button>
                    </Space>
                  }
                >
                  {tasksError && <div className="admin-ops-error">{tasksError}</div>}
                  <div className="admin-table-wrap">
                    <Table<AdminTaskItem>
                      columns={tasksColumns}
                      dataSource={tasks}
                      rowKey="id"
                      loading={tasksLoading}
                      scroll={{ x: 1100, y: 'calc(80vh - 360px)' }}
                      pagination={{
                        current: Math.floor(offset / limit) + 1,
                        pageSize: limit,
                        total,
                        showSizeChanger: false,
                        onChange: (page) => setOffset((page - 1) * limit),
                      }}
                    />
                  </div>
                </Card>
              </div>
            ),
          },
          {
            key: 'users',
            label: '用户管理',
            children: (
              <div className="admin-ops-section">
                <Card
                  size="small"
                  className="admin-ops-card"
                  title="用户列表"
                  extra={
                    <Space className="admin-ops-card-toolbar" wrap size={8}>
                      <Input
                        placeholder="搜索用户名 / 邮箱 / 手机号"
                        value={usersSearch}
                        onChange={(e) => setUsersSearch(e.target.value)}
                        onPressEnter={() => void fetchUsers({ page: 1 })}
                        style={{ width: 240, maxWidth: '100%' }}
                        allowClear
                      />
                      <Select
                        value={usersRole}
                        onChange={(v) => { setUsersPage(1); setUsersRole(v); }}
                        placeholder="全部角色"
                        style={{ width: 140 }}
                        options={[
                          { value: '', label: '全部角色' },
                          { value: 'user', label: 'user' },
                          { value: 'admin', label: 'admin' },
                        ]}
                      />
                      <Button type="primary" size="small" onClick={() => void fetchUsers({ page: 1 })} loading={usersLoading}>
                        查询
                      </Button>
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateUser}>
                        创建用户
                      </Button>
                    </Space>
                  }
                >
                  {usersError && <div className="admin-ops-error">{usersError}</div>}
                  <div className="admin-table-wrap">
                    <Table<AdminUserItem>
                      columns={usersColumns}
                      dataSource={users}
                      rowKey="id"
                      loading={usersLoading}
                      size="small"
                      scroll={{ x: 1400, y: 'calc(80vh - 360px)' }}
                      pagination={{
                        current: usersPage,
                        pageSize: usersLimit,
                        total: usersTotal,
                        showSizeChanger: false,
                        showTotal: (t) => `共 ${t} 条`,
                        onChange: (p) => { setUsersPage(p); void fetchUsers({ page: p }); },
                      }}
                    />
                  </div>
                </Card>

                <Modal
                  title="创建用户"
                  open={createOpen}
                  onOk={() => void handleCreateUser()}
                  confirmLoading={createSaving}
                  onCancel={() => setCreateOpen(false)}
                  okText="创建"
                  cancelText="取消"
                  destroyOnHidden
                >
                  <Form form={createForm} layout="vertical" requiredMark="optional">
                    <Form.Item
                      name="username"
                      label="用户名"
                      rules={[{ required: true, message: '请输入用户名' }, { min: 2, message: '至少 2 个字符' }]}
                      required
                    >
                      <Input placeholder="登录用户名" autoComplete="off" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="初始密码"
                      rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位' }]}
                      required
                    >
                      <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="email" label="邮箱">
                      <Input placeholder="邮箱（与手机号至少填一项）" />
                    </Form.Item>
                    <Form.Item name="phone" label="手机号">
                      <Input placeholder="手机号（与邮箱至少填一项）" />
                    </Form.Item>
                    <Form.Item name="role" label="角色" initialValue="user">
                      <Select
                        options={[
                          { value: 'user', label: '普通用户' },
                          { value: 'admin', label: '管理员' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="membership_type" label="会员类型" initialValue="free">
                      <Select
                        options={[
                          { value: 'free', label: 'free' },
                          { value: 'pro', label: 'pro' },
                          { value: 'premium', label: 'premium' },
                        ]}
                      />
                    </Form.Item>
                  </Form>
                </Modal>

                <Modal
                  title={`发放 MXM-TOKEN → ${depositTarget?.username ?? ''}`}
                  open={depositOpen}
                  onOk={() => void handleDeposit()}
                  confirmLoading={depositSaving}
                  onCancel={() => {
                    setDepositOpen(false);
                    setDepositTarget(null);
                  }}
                  okText="确认发放"
                  cancelText="取消"
                  destroyOnHidden
                >
                  {depositTarget && (
                    <p className="muted" style={{ marginBottom: 12 }}>
                      当前余额：{' '}
                      {balanceLoadingId === depositTarget.id
                        ? '加载中…'
                        : mxmBalances[depositTarget.id] != null
                          ? Number(mxmBalances[depositTarget.id]).toLocaleString()
                          : '—'}
                    </p>
                  )}
                  <Form form={depositForm} layout="vertical">
                    <Form.Item
                      name="amount"
                      label="发放数量（MXM-TOKEN）"
                      rules={[
                        { required: true, message: '请输入数量' },
                        { type: 'number', min: 0.01, message: '必须大于 0' },
                      ]}
                    >
                      <InputNumber style={{ width: '100%' }} min={0.01} step={100} precision={2} placeholder="例如 1000" />
                    </Form.Item>
                    <Form.Item name="note" label="备注（可选）">
                      <Input.TextArea rows={2} placeholder="发放原因，便于对账" />
                    </Form.Item>
                  </Form>
                </Modal>
              </div>
            ),
          },
          {
            key: 'agent',
            label: 'AI 助手',
            children: <AdminAgentConfig />,
          },
        ]}
          />
        </div>
      </div>
    </div>
  );
}

