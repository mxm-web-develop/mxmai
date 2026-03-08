import { useState, useEffect, useCallback, useMemo } from 'react';
import { Column, Pie } from '@ant-design/charts';
import { Statistic, Card, Select, Button, Table, Space, Tooltip, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getAdminStats, type AdminStatsData } from '../api/client';
import { useAuth } from '../context/AuthContext';

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

function recordToPieData(record: Record<string, number>): { type: string; value: number }[] {
  return Object.entries(record).map(([type, value]) => ({ type, value }));
}

export default function AdminStats() {
  const { isLoggedIn } = useAuth();
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const topLimit = 10;

  const fetchStats = useCallback(async () => {
    if (!isLoggedIn) {
      setError('请先使用 Admin 账号登录');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getAdminStats({ days, topLimit });
    setLoading(false);
    if (res.error) {
      setError(res.status === 403 ? '需要 Admin 权限' : res.error);
      return;
    }
    const body = res.data as { success?: boolean; data?: AdminStatsData } | AdminStatsData;
    const statsData = body && typeof body === 'object' && 'data' in body ? body.data : (body as AdminStatsData);
    if (statsData && typeof statsData === 'object') setStats(statsData);
  }, [isLoggedIn, days, topLimit]);

  useEffect(() => {
    if (isLoggedIn) fetchStats();
  }, [isLoggedIn, fetchStats]);

  const dailyChartData = useMemo(() => {
    if (!stats?.dailyUsage?.length) return [];
    return [...stats.dailyUsage].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  }, [stats?.dailyUsage]);

  const statusPieData = useMemo(
    () => (stats?.taskCountByStatus ? recordToPieData(stats.taskCountByStatus) : []),
    [stats?.taskCountByStatus]
  );

  const typePieData = useMemo(
    () => (stats?.taskCountByType ? recordToPieData(stats.taskCountByType) : []),
    [stats?.taskCountByType]
  );

  const topUsersDataSource = useMemo(() => {
    if (!stats?.topUsersByUsage?.length) return [];
    return stats.topUsersByUsage.map((u, i) => ({ ...u, rank: i + 1, key: u.userId }));
  }, [stats?.topUsersByUsage]);

  const topUsersColumns: ColumnsType<{ rank: number; userId: string; username: string; taskCount: number; key: string }> = [
    { title: '排名', dataIndex: 'rank', key: 'rank', width: 70 },
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    {
      title: '用户 ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 180,
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <span>{id}</span>
        </Tooltip>
      ),
    },
    { title: '任务数', dataIndex: 'taskCount', key: 'taskCount', width: 90 },
  ];

  const columnChartConfig = useMemo(
    () => ({
      data: dailyChartData,
      xField: 'date',
      yField: 'count',
      height: 320,
      theme: DARK_THEME,
      axis: {
        x: {
          labelAutoRotate: true,
          labelFill: '#e0e0e0',
          titleFill: '#e0e0e0',
          labelFontSize: 12,
          titleText: '日期',
        },
        y: {
          labelFill: '#e0e0e0',
          titleFill: '#e0e0e0',
          titleText: '任务数',
          labelFontSize: 12,
        },
      },
      xAxis: {
        label: {
          autoRotate: true,
          style: { fill: '#e0e0e0', fontSize: 13 },
          formatter: (v: string) => (v && v.length >= 10 ? v.slice(5, 10) : v),
        },
        title: { style: { fill: '#e0e0e0', fontSize: 13 } },
      },
      yAxis: {
        title: { text: '任务数', style: { fill: '#e0e0e0', fontSize: 13 } },
        label: { style: { fill: '#e0e0e0', fontSize: 13 } },
      },
      animation: { appear: { duration: 400 } },
    }),
    [dailyChartData]
  );

  const PIE_COLORS = ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9845'];
  const pieConfig = (data: { type: string; value: number }[]) => ({
    data,
    angleField: 'value',
    colorField: 'type',
    color: PIE_COLORS,
    radius: 0.85,
    innerRadius: 0.4,
    height: 360,
    theme: DARK_THEME,
    legend: false,
    label: false,
    tooltip: {
      title: 'type',
      items: [{ field: 'value', name: '任务数' }],
    },
    animation: { appear: { duration: 400 } },
  });

  if (!isLoggedIn) {
    return (
      <div className="page-card">
        <h2>系统概览</h2>
        <p>请先使用 Admin 账号登录后再查看。</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-card">
        <h2>系统概览</h2>
        <p style={{ color: 'var(--error, #c00)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="page-card admin-stats-page">
      <h2>系统概览</h2>
      <p className="hint">Admin 专用，展示用户数、任务统计、每日用量与 Top 用户。</p>

      <Space wrap size="middle" style={{ marginBottom: 16 }}>
        <span>每日用量天数：</span>
        <Select
          value={days}
          onChange={setDays}
          style={{ width: 100 }}
          options={[
            { value: 7, label: '7 天' },
            { value: 14, label: '14 天' },
            { value: 30, label: '30 天' },
            { value: 60, label: '60 天' },
            { value: 90, label: '90 天' },
          ]}
        />
        <Button type="primary" onClick={fetchStats} loading={loading}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </Space>

      <div className="admin-stats-content-wrap">
        <div className="admin-stats-content-inner">
          {loading && !stats ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280 }}>
              <Spin size="large" tip="加载中…" />
            </div>
          ) : stats ? (
            <>
              <Space wrap size="middle" style={{ marginBottom: 24 }}>
                <Card size="small" style={{ minWidth: 140 }}>
                  <Statistic title="用户总数" value={stats.userCount} />
                </Card>
                <Card size="small" style={{ minWidth: 140 }}>
                  <Statistic title="任务总数" value={stats.taskCount} />
                </Card>
              </Space>

              {dailyChartData.length > 0 && (
                <div style={{ marginBottom: 24 }} className="admin-stats-chart-wrap">
                  <h3 style={{ marginBottom: 12 }}>每日任务用量（最近 {dailyChartData.length} 天）</h3>
                  <Column {...columnChartConfig} />
                </div>
              )}

              <Space wrap size="large" style={{ marginBottom: 24 }} align="start">
                {statusPieData.length > 0 && (
                  <div style={{ minWidth: 320 }} className="admin-stats-chart-wrap">
                    <h3 style={{ marginBottom: 12 }}>任务按状态</h3>
                    <Pie {...pieConfig(statusPieData)} />
                    <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none', color: '#e0e0e0', fontSize: 14 }}>
                      {statusPieData.map((d, i) => (
                        <li key={d.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span>{d.type}: {d.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {typePieData.length > 0 && (
                  <div style={{ minWidth: 320 }} className="admin-stats-chart-wrap">
                    <h3 style={{ marginBottom: 12 }}>任务按类型</h3>
                    <Pie {...pieConfig(typePieData)} />
                    <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none', color: '#e0e0e0', fontSize: 14 }}>
                      {typePieData.map((d, i) => (
                        <li key={d.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span>{d.type}: {d.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Space>

              {topUsersDataSource.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ marginBottom: 12 }}>用量 Top {topUsersDataSource.length} 用户</h3>
                  <Table
                    columns={topUsersColumns}
                    dataSource={topUsersDataSource}
                    rowKey="key"
                    size="small"
                    pagination={false}
                  />
                </div>
              )}

              {(!stats.dailyUsage || stats.dailyUsage.length === 0) &&
                (!stats.topUsersByUsage || stats.topUsersByUsage.length === 0) && (
                <p className="hint" style={{ marginTop: 16 }}>
                  每日用量与 Top 用户需执行迁移：<code>pnpm --filter @mxmai/mxmdata run migrate:admin-stats</code>
                  （需配置 SUPABASE_DB_URL）；若已迁移仍为空，可能为近期无任务数据。
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
