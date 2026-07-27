/**
 * 开放 API 调用统计 — MiniMax 风格用量面板（趋势图 + 明细 Tab）
 */
import '../styles/openapi-usage.css';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, Column } from '@ant-design/charts';
import { Button, Empty, Select, Space, Table, Tabs, Tag, Typography, Alert } from 'antd';
import BrandLoading from './BrandLoading';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import {
  type PublishedApiItem,
  type PublishedApiUsageRecentEvent,
  type PublishedApiUsageStats,
} from '../api/client';
import {
  saveOpenApiTaskNav,
  scopeToNavPage,
  type OpenApiNavPageId,
} from '../lib/openApiTaskNavigation';

const CHART_THEME = {
  defaultColor: '#38bdf8',
  style: {
    axisLabelFill: 'rgba(226, 232, 240, 0.85)',
    axisTitleFill: 'rgba(226, 232, 240, 0.85)',
    legendLabelFill: 'rgba(226, 232, 240, 0.85)',
    labelFill: 'rgba(226, 232, 240, 0.85)',
    titleFill: 'rgba(226, 232, 240, 0.85)',
  },
};

type ChartMetric = 'calls' | 'tokens';

export interface OpenApiUsageStatsPanelProps {
  stats: PublishedApiUsageStats | null;
  loading: boolean;
  days: number;
  onDaysChange: (days: number) => void;
  statsApiId: string | null;
  onStatsApiIdChange: (id: string | null) => void;
  apis: PublishedApiItem[];
  onRefresh: () => void;
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('zh-CN');
}

function formatToken(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

export function OpenApiUsageStatsPanel({
  stats,
  loading,
  days,
  onDaysChange,
  statsApiId,
  onStatsApiIdChange,
  apis,
  onRefresh,
}: OpenApiUsageStatsPanelProps) {
  const { t } = useTranslation();
  const [chartMetric, setChartMetric] = useState<ChartMetric>('calls');
  const [detailTab, setDetailTab] = useState('byApi');

  const dailySorted = useMemo(() => {
    if (!stats?.daily?.length) return [];
    return [...stats.daily].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [stats?.daily]);

  const chartData = useMemo(
    () =>
      dailySorted.map((d) => ({
        date: d.date,
        calls: d.call_count,
        tokens: d.tokens_charged,
      })),
    [dailySorted]
  );

  const derived = useMemo(() => {
    const totalCalls = stats?.totalCalls ?? 0;
    const totalTokens = stats?.totalTokensCharged ?? 0;
    const activeDays = dailySorted.filter((d) => d.call_count > 0).length;
    let peakCalls = 0;
    let peakDate = '—';
    for (const d of dailySorted) {
      if (d.call_count >= peakCalls) {
        peakCalls = d.call_count;
        peakDate = d.date;
      }
    }
    const avgDaily = activeDays > 0 ? totalCalls / activeDays : 0;
    const successRate =
      totalCalls > 0 ? Math.round(((stats?.completedCalls ?? 0) / totalCalls) * 100) : null;
    return { totalCalls, totalTokens, activeDays, peakCalls, peakDate, avgDaily, successRate };
  }, [stats, dailySorted]);

  const areaConfig = useMemo(
    () => ({
      data: chartData,
      xField: 'date',
      yField: chartMetric,
      height: 280,
      smooth: true,
      theme: CHART_THEME,
      areaStyle: { fill: 'l(270) 0:#0ea5e933 1:#0ea5e900' },
      line: { style: { stroke: '#38bdf8', lineWidth: 2 } },
      axis: {
        x: {
          labelAutoRotate: true,
          labelFill: 'rgba(226, 232, 240, 0.75)',
          titleFill: 'rgba(226, 232, 240, 0.75)',
          labelFontSize: 11,
          titleText: t('assets.openApi.date'),
        },
        y: {
          labelFill: 'rgba(226, 232, 240, 0.75)',
          titleFill: 'rgba(226, 232, 240, 0.75)',
          titleText: chartMetric === 'calls' ? t('assets.openApi.callCount') : t('assets.openApi.tokenDeduct'),
          labelFontSize: 11,
        },
      },
      xAxis: {
        label: {
          autoRotate: true,
          formatter: (v: string) => (v && v.length >= 10 ? v.slice(5) : v),
        },
      },
      animation: { appear: { duration: 350 } },
    }),
    [chartData, chartMetric]
  );

  const statusColumnConfig = useMemo(
    () => ({
      data: [
        { status: t('assets.openApi.completed'), count: stats?.completedCalls ?? 0 },
        { status: t('assets.openApi.inProgress'), count: stats?.pendingCalls ?? 0 },
        { status: t('assets.openApi.failed'), count: stats?.failedCalls ?? 0 },
      ],
      xField: 'status',
      yField: 'count',
      height: 200,
      theme: CHART_THEME,
      colorField: 'status',
      scale: {
        color: {
          domain: [t('assets.openApi.completed'), t('assets.openApi.inProgress'), t('assets.openApi.failed')],
          range: ['#34d399', '#94a3b8', '#f87171'],
        },
      },
      axis: {
        x: { labelFill: 'rgba(226, 232, 240, 0.75)' },
        y: { labelFill: 'rgba(226, 232, 240, 0.75)', titleText: t('assets.openApi.count') },
      },
      legend: false,
      animation: { appear: { duration: 300 } },
    }),
    [stats]
  );

  const byApiColumns: ColumnsType<NonNullable<PublishedApiUsageStats['byApi']>[number]> = [
    {
      title: 'Slug',
      dataIndex: 'slug',
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
    },
    { title: t('assets.openApi.name'), dataIndex: 'title', ellipsis: true },
    { title: t('assets.openApi.callCount'), dataIndex: 'call_count', width: 100 },
    {
      title: t('assets.openApi.tokenDeductCol'),
      dataIndex: 'tokens_charged',
      width: 120,
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: t('assets.openApi.lastCall'),
      dataIndex: 'last_called_at',
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
    },
  ];

  const byCallerColumns: ColumnsType<NonNullable<PublishedApiUsageStats['byCaller']>[number]> = [
    {
      title: t('assets.openApi.user'),
      key: 'user',
      render: (_: unknown, r) =>
        r.username ? (
          <span>{r.username}</span>
        ) : r.caller_user_id ? (
          <Typography.Text code copyable={{ text: r.caller_user_id }}>
            {r.caller_user_id.slice(0, 8)}…
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    { title: t('assets.openApi.callCount'), dataIndex: 'call_count', width: 100 },
    {
      title: t('assets.openApi.tokenDeductCol'),
      dataIndex: 'tokens_charged',
      width: 120,
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: t('assets.openApi.lastCall'),
      dataIndex: 'last_called_at',
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
    },
  ];

  const byEndUserColumns: ColumnsType<NonNullable<PublishedApiUsageStats['byEndUser']>[number]> = [
    {
      title: t('assets.openApi.phone'),
      dataIndex: 'phone',
      width: 130,
      render: (v: string | null, r) => v ?? r.phone_masked ?? '—',
    },
    { title: t('assets.openApi.nickname'), dataIndex: 'display_name', ellipsis: true, width: 120 },
    { title: t('assets.openApi.callCount'), dataIndex: 'call_count', width: 100 },
    {
      title: t('assets.openApi.tokenDeductCol'),
      dataIndex: 'tokens_charged',
      width: 120,
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: t('assets.openApi.lastCall'),
      dataIndex: 'last_called_at',
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
    },
  ];

  const recentColumns: ColumnsType<PublishedApiUsageRecentEvent> = [
    {
      title: t('assets.openApi.time'),
      dataIndex: 'created_at',
      width: 168,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      width: 130,
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: t('assets.openApi.endUser'),
      dataIndex: 'end_user_phone',
      width: 120,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: t('assets.openApi.status'),
      dataIndex: 'status',
      width: 88,
      render: (s: string) => {
        const color = s === 'completed' ? 'green' : s === 'failed' ? 'red' : 'default';
        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: 'Token',
      dataIndex: 'tokens_charged',
      width: 88,
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      title: t('assets.openApi.actions'),
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_: unknown, row) => {
        const page = scopeToNavPage(row.task_v2_scope, row.kind);
        if (!page || !row.job_id) return '—';
        return (
          <Button
            type="link"
            size="small"
            onClick={() => {
              saveOpenApiTaskNav({
                page: page as OpenApiNavPageId,
                taskId: row.job_id,
                creationSourceTab: 'open_api',
              });
            }}
          >
            {t('assets.openApi.viewOutput')}
          </Button>
        );
      },
    },
  ];

  const detailTabs = [
    {
      key: 'byApi',
      label: t('assets.openApi.byApi'),
      children: (
        <Table
          size="small"
          rowKey="published_api_id"
          loading={loading}
          dataSource={stats?.byApi ?? []}
          columns={byApiColumns}
          pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
          scroll={{ x: 720 }}
          locale={{ emptyText: t('assets.openApi.noCallRecords') }}
        />
      ),
    },
    {
      key: 'byCaller',
      label: t('assets.openApi.byCaller'),
      children: (
        <Table
          size="small"
          rowKey={(r) => r.caller_user_id || '__anonymous__'}
          loading={loading}
          dataSource={stats?.byCaller ?? []}
          columns={byCallerColumns}
          pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
          scroll={{ x: 640 }}
          locale={{ emptyText: t('assets.openApi.noCallerData') }}
        />
      ),
    },
    {
      key: 'byEndUser',
      label: t('assets.openApi.endUsers'),
      children: (
        <Table
          size="small"
          rowKey="end_user_id"
          loading={loading}
          dataSource={stats?.byEndUser ?? []}
          columns={byEndUserColumns}
          pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
          scroll={{ x: 720 }}
          locale={{ emptyText: t('assets.openApi.noEndUserCalls') }}
        />
      ),
    },
    {
      key: 'recent',
      label: t('assets.openApi.recentCalls'),
      children: (
        <Table
          size="small"
          rowKey="job_id"
          loading={loading}
          dataSource={stats?.recentEvents ?? []}
          columns={recentColumns}
          pagination={{ pageSize: 10, hideOnSinglePage: true, size: 'small' }}
          scroll={{ x: 860 }}
          locale={{ emptyText: t('assets.openApi.noRecentCalls') }}
        />
      ),
    },
  ];

  return (
    <div className="openapi-usage-panel">
      <Alert
        type="info"
        showIcon
        className="openapi-usage-scope-hint"
        title={t('assets.openApi.statsScopeTitle')}
        description={t('assets.openApi.statsScopeDesc')}
      />

      <div className="openapi-usage-toolbar">
        <div className="openapi-usage-toolbar__filters">
          <span className="openapi-usage-toolbar__label">统计范围</span>
          <Select
            className="openapi-usage-toolbar__api"
            allowClear
            placeholder={t('assets.openApi.allPublishedApi')}
            value={statsApiId ?? undefined}
            onChange={(v) => onStatsApiIdChange(v ?? null)}
            options={apis.map((a) => ({
              value: a.id,
              label: `${a.slug} · ${a.title}`,
            }))}
          />
          <Select
            className="openapi-usage-toolbar__days"
            value={days}
            onChange={onDaysChange}
            options={[
              { value: 7, label: t('account.usagePanel.last7Days') },
              { value: 30, label: t('account.usagePanel.last30Days') },
              { value: 90, label: t('account.usagePanel.last90Days') },
            ]}
          />
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
          刷新
        </Button>
      </div>

      {loading && !stats ? (
        <div className="openapi-usage-loading">
          <BrandLoading tip={t('assets.openApi.loadingStats')} />
        </div>
      ) : (
        <>
          <section className="openapi-usage-hero" aria-label="用量概览">
            <div className="openapi-usage-hero__card openapi-usage-hero__card--primary">
              <span className="openapi-usage-hero__label">近 {days} 天总调用</span>
              <span className="openapi-usage-hero__value">{formatCompact(derived.totalCalls)}</span>
              <span className="openapi-usage-hero__hint">
                活跃 {derived.activeDays} 天 · 日均 {formatCompact(derived.avgDaily)}
              </span>
            </div>
            <div className="openapi-usage-hero__card">
              <span className="openapi-usage-hero__label">扣减 MXM-TOKEN</span>
              <span className="openapi-usage-hero__value">{formatToken(derived.totalTokens)}</span>
              <span className="openapi-usage-hero__hint">第三方调用从你的账户扣费</span>
            </div>
            <div className="openapi-usage-hero__card">
              <span className="openapi-usage-hero__label">单日峰值</span>
              <span className="openapi-usage-hero__value">{formatCompact(derived.peakCalls)}</span>
              <span className="openapi-usage-hero__hint">{derived.peakDate}</span>
            </div>
          </section>

          <div className="openapi-usage-status-row">
            <span className="openapi-usage-status-chip openapi-usage-status-chip--ok">
              已完成 {stats?.completedCalls ?? 0}
            </span>
            <span className="openapi-usage-status-chip openapi-usage-status-chip--pending">
              进行中 {stats?.pendingCalls ?? 0}
            </span>
            <span className="openapi-usage-status-chip openapi-usage-status-chip--fail">
              失败 {stats?.failedCalls ?? 0}
            </span>
            {derived.successRate != null ? (
              <span className="openapi-usage-status-note">完成率 {derived.successRate}%</span>
            ) : null}
          </div>

          <section className="openapi-usage-chart-section">
            <div className="openapi-usage-chart-main">
              <div className="openapi-usage-chart-head">
                <Typography.Title level={5} className="openapi-usage-chart-title">
                  调用趋势
                </Typography.Title>
                <Space size={4} className="openapi-usage-chart-toggle">
                  <Button
                    size="small"
                    type={chartMetric === 'calls' ? 'primary' : 'default'}
                    onClick={() => setChartMetric('calls')}
                  >
                    调用次数
                  </Button>
                  <Button
                    size="small"
                    type={chartMetric === 'tokens' ? 'primary' : 'default'}
                    onClick={() => setChartMetric('tokens')}
                  >
                    Token 扣减
                  </Button>
                </Space>
              </div>
              {chartData.length > 0 ? (
                <div className="openapi-usage-chart-body">
                  <Area {...areaConfig} />
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="所选时间范围内暂无调用"
                  className="openapi-usage-chart-empty"
                />
              )}
            </div>

            <aside className="openapi-usage-chart-side">
              <Typography.Title level={5} className="openapi-usage-chart-title">
                状态分布
              </Typography.Title>
              {(stats?.totalCalls ?? 0) > 0 ? (
                <Column {...statusColumnConfig} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
              )}
              <dl className="openapi-usage-side-stats">
                <div>
                  <dt>累计调用</dt>
                  <dd>{formatCompact(derived.totalCalls)}</dd>
                </div>
                <div>
                  <dt>累计扣费</dt>
                  <dd>{formatToken(derived.totalTokens)}</dd>
                </div>
                <div>
                  <dt>活跃天数</dt>
                  <dd>{derived.activeDays}</dd>
                </div>
              </dl>
            </aside>
          </section>

          <section className="openapi-usage-detail">
            <Typography.Title level={5} className="openapi-usage-detail-title">
              明细数据
            </Typography.Title>
            <Tabs
              activeKey={detailTab}
              onChange={setDetailTab}
              size="small"
              items={detailTabs}
              destroyOnHidden={false}
            />
          </section>
        </>
      )}
    </div>
  );
}
