import { useCallback, useEffect, useState } from 'react';
import { App, Card, Select, Statistic, Table, Typography } from 'antd';
import {
  getPartnerAppStats,
  listPartnerAppEndUsers,
  listPartnerApps,
  type PartnerAppItem,
} from '../api/client';

type EndUserRow = {
  end_user_id?: string | null;
  id?: string;
  phone?: string | null;
  phone_masked?: string | null;
  display_name?: string | null;
  user_kind?: string | null;
  kind?: string;
  call_count?: number;
  tokens_charged?: number;
  last_called_at?: string | null;
  created_at?: string;
};

export function PartnerAppsPanel() {
  const { message } = App.useApp();
  const [apps, setApps] = useState<PartnerAppItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [endUsers, setEndUsers] = useState<EndUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPartnerApps();
      const list = res.data ?? [];
      setApps(list);
      if (list.length && !selectedId) setSelectedId(list[0].id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载 Partner 应用失败');
    } finally {
      setLoading(false);
    }
  }, [message, selectedId]);

  const loadStats = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await getPartnerAppStats(selectedId, 30, 'end_user');
      setStats((res.data as Record<string, unknown>) ?? null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载统计失败');
    }
  }, [selectedId, message]);

  const loadEndUsers = useCallback(async () => {
    if (!selectedId) return;
    setUsersLoading(true);
    try {
      const res = await listPartnerAppEndUsers(selectedId, 30);
      setEndUsers((res.data as EndUserRow[]) ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载终端用户失败');
    } finally {
      setUsersLoading(false);
    }
  }, [selectedId, message]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  useEffect(() => {
    void loadStats();
    void loadEndUsers();
  }, [loadStats, loadEndUsers]);

  const byEndUser = (stats?.byEndUser as EndUserRow[]) ?? [];
  const tableData = endUsers.length > 0 ? endUsers : byEndUser;

  return (
    <div className="space-y-4">
      <Typography.Paragraph type="secondary">
        绑定 integration Key 的 Partner 应用；下方为 H5 短信登录终端用户及近 30 天调用数据（含手机号）。
      </Typography.Paragraph>
      <Select
        style={{ minWidth: 280 }}
        placeholder="选择 Partner 应用"
        value={selectedId ?? undefined}
        onChange={setSelectedId}
        options={apps.map((a) => ({ value: a.id, label: `${a.name} (${a.allowedSlugs.length} slugs)` }))}
        loading={loading}
      />
      {stats && (
        <Card size="small">
          <Statistic title="总调用（近 30 天）" value={Number(stats.totalCalls ?? 0)} />
        </Card>
      )}
      <Table
        size="small"
        loading={usersLoading}
        rowKey={(r) => String(r.id ?? r.end_user_id ?? Math.random())}
        dataSource={tableData}
        scroll={{ x: 900 }}
        columns={[
          {
            title: '手机号',
            dataIndex: 'phone',
            width: 140,
            render: (v: string | null, r: EndUserRow) => v ?? r.phone_masked ?? '—',
          },
          { title: '昵称', dataIndex: 'display_name', ellipsis: true, width: 120 },
          {
            title: '类型',
            dataIndex: 'kind',
            width: 90,
            render: (_: unknown, r: EndUserRow) => r.user_kind ?? r.kind ?? '—',
          },
          { title: '调用次数', dataIndex: 'call_count', width: 100 },
          {
            title: 'Token',
            dataIndex: 'tokens_charged',
            width: 110,
            render: (v: number | undefined) => (v != null ? Number(v).toFixed(2) : '0.00'),
          },
          {
            title: '最近调用',
            dataIndex: 'last_called_at',
            width: 170,
            render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
          },
          {
            title: '用户 ID',
            dataIndex: 'end_user_id',
            ellipsis: true,
            render: (v: string | null, r: EndUserRow) => (
              <Typography.Text code copyable={{ text: String(v ?? r.id ?? '') }}>
                {(v ?? r.id ?? '').slice(0, 8)}…
              </Typography.Text>
            ),
          },
        ]}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />
    </div>
  );
}
