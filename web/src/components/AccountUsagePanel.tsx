/**
 * 账号中心 — 全平台用量统计（Web 自用 + 第三方 Open API）
 */
import '../styles/openapi-usage.css';
import BrandLoading from './BrandLoading';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppLang, toBcp47 } from '../i18n/appLocale';
import { Area, Column } from '@ant-design/charts';
import {
  Button,
  Card,
  Empty,
  Segmented,
  Select,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import {
  getAccountUsageEvents,
  getAccountUsageSummary,
  type AccountUsageSourceFilter,
  type AccountUsageSummary,
  type AccountUsageByScopeRow,
} from '../api/client';

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

type ChartMetric = 'mxm' | 'tokens' | 'images';

export interface AccountUsagePanelProps {
  initialSource?: AccountUsageSourceFilter;
  highlightSlug?: string | null;
}

function formatCompact(n: number, locale = 'en-US'): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(locale);
}

function formatToken(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function scopePrimaryMetric(
  row: AccountUsageByScopeRow,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale = 'en-US'
): string {
  if (row.metricKind === 'token') {
    return `${formatCompact(row.totalTokens || row.inputTokens + row.outputTokens, locale)} tokens`;
  }
  if (row.scope === 'graph') return t('account.usagePanel.imagesUnit', { count: row.imageCount });
  return t('account.usagePanel.requestsUnit', { count: row.requestCount });
}

export function AccountUsagePanel({
  initialSource = 'all',
  highlightSlug = null,
}: AccountUsagePanelProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = toBcp47(toAppLang(i18n.language));
  const SCOPE_LABELS: Record<string, string> = {
    text: t('account.usagePanel.scopes.text'),
    writing: t('account.usagePanel.scopes.writing'),
    graph: t('account.usagePanel.scopes.graph'),
    video: t('account.usagePanel.scopes.video'),
    audio: t('account.usagePanel.scopes.audio'),
    music: t('account.usagePanel.scopes.music'),
  };
  const CHART_METRIC_LABEL: Record<ChartMetric, string> = {
    mxm: t('account.usagePanel.metrics.mxm'),
    tokens: t('account.usagePanel.token'),
    images: t('account.usagePanel.metrics.images'),
  };
  const [days, setDays] = useState(30);
  const [source, setSource] = useState<AccountUsageSourceFilter>(initialSource);
  const [summary, setSummary] = useState<AccountUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('mxm');
  const [detailTab, setDetailTab] = useState('byScope');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(20);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsItems, setEventsItems] = useState<AccountUsageSummary['recent']>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    setSource(initialSource);
  }, [initialSource]);

  useEffect(() => {
    setEventsPage(1);
  }, [days, source, highlightSlug]);

  useEffect(() => {
    if (highlightSlug && initialSource === 'open_api') {
      setDetailTab('openApiSlug');
    }
  }, [highlightSlug, initialSource]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAccountUsageSummary({ days, source });
      if (res.error) {
        setSummary(null);
        return;
      }
      const body = res.data as { data?: AccountUsageSummary } | AccountUsageSummary;
      const data =
        body && typeof body === 'object' && 'data' in body
          ? (body as { data?: AccountUsageSummary }).data
          : (body as AccountUsageSummary);
      setSummary(data && typeof data === 'object' ? data : null);
    } finally {
      setLoading(false);
    }
  }, [days, source]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await getAccountUsageEvents({
        days,
        source,
        slug: highlightSlug ?? undefined,
        page: eventsPage,
        limit: eventsPageSize,
      });
      if (res.error) {
        setEventsItems([]);
        setEventsTotal(0);
        return;
      }
      const body = res.data as { data?: { items?: AccountUsageSummary['recent']; total?: number } };
      const pageData = body?.data;
      setEventsItems(pageData?.items ?? []);
      setEventsTotal(pageData?.total ?? 0);
    } finally {
      setEventsLoading(false);
    }
  }, [days, source, highlightSlug, eventsPage, eventsPageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detailTab !== 'recent') return;
    void loadEvents();
  }, [detailTab, loadEvents]);

  const chartData = useMemo(() => {
    if (!summary?.daily?.length) return [];
    return [...summary.daily]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((d) => ({
        date: d.date,
        mxm: d.mxmTokenCharged,
        tokens: d.inputTokens + d.outputTokens,
        images: d.imageCount,
      }));
  }, [summary?.daily]);

  const areaConfig = useMemo(
    () => ({
      data: chartData,
      xField: 'date',
      yField: chartMetric,
      height: 300,
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
          titleText: t('account.usagePanel.date'),
        },
        y: {
          labelFill: 'rgba(226, 232, 240, 0.75)',
          titleFill: 'rgba(226, 232, 240, 0.75)',
          titleText: CHART_METRIC_LABEL[chartMetric],
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

  const sourceColumnConfig = useMemo(
    () => ({
      data: [
        { source: t('account.usagePanel.sourceWeb'), value: summary?.bySource.web.mxmTokenCharged ?? 0 },
        { source: t('account.usagePanel.sourceOpenApi'), value: summary?.bySource.open_api.mxmTokenCharged ?? 0 },
      ],
      xField: 'source',
      yField: 'value',
      height: 220,
      theme: CHART_THEME,
      legend: false,
      axis: {
        x: { labelFill: 'rgba(226, 232, 240, 0.75)' },
        y: { labelFill: 'rgba(226, 232, 240, 0.75)', titleText: 'MXM' },
      },
      animation: { appear: { duration: 300 } },
    }),
    [summary?.bySource]
  );

  const totals = summary?.totals;
  const writingTokens =
    summary?.byScope.find((r) => r.scope === 'writing')?.totalTokens ??
    summary?.byScope.find((r) => r.scope === 'text')?.totalTokens ??
    0;
  const graphImages = summary?.byScope.find((r) => r.scope === 'graph')?.imageCount ?? 0;
  const mediaRequests =
    (totals?.videoRequests ?? 0) + (totals?.audioRequests ?? 0) + (totals?.musicRequests ?? 0);

  const openApiSlugRows = useMemo(() => {
    const rows = summary?.openApi?.bySlug ?? [];
    if (!highlightSlug) return rows;
    return rows.filter((r) => r.slug === highlightSlug);
  }, [summary?.openApi?.bySlug, highlightSlug]);

  const recentColumns: ColumnsType<AccountUsageSummary['recent'][number]> = [
    {
      title: t('account.usagePanel.time'),
      dataIndex: 'createdAt',
      width: 168,
      render: (v: string) => new Date(v).toLocaleString(dateLocale),
    },
    {
      title: t('account.usagePanel.source'),
      dataIndex: 'usageSource',
      width: 88,
      render: (v: string) =>
        v === 'open_api' ? <Tag color="purple">{t('account.usagePanel.sourceOpenApi')}</Tag> : <Tag>{t('account.usagePanel.selfUse')}</Tag>,
    },
    {
      title: t('account.usagePanel.business'),
      dataIndex: 'displayScope',
      width: 72,
      render: (v: string) => SCOPE_LABELS[v] ?? v,
    },
    {
      title: t('account.usagePanel.usage'),
      key: 'usage',
      width: 120,
      render: (_: unknown, r) =>
        r.imageCount > 0
          ? t('account.usagePanel.imagesUnit', { count: r.imageCount })
          : r.inputTokens + r.outputTokens > 0
            ? `${formatCompact(r.inputTokens + r.outputTokens)} tok`
            : t('account.usagePanel.requestsUnit', { count: r.requestCount }),
    },
    {
      title: 'MXM',
      dataIndex: 'mxmTokenCharged',
      width: 88,
      render: (v: number) => formatToken(v),
    },
    {
      title: 'Slug',
      dataIndex: 'publishedSlug',
      width: 120,
      render: (v: string | null) => (v ? <Typography.Text code>{v}</Typography.Text> : '—'),
    },
    {
      title: t('account.usagePanel.model'),
      dataIndex: 'modelKey',
      ellipsis: true,
    },
  ];

  const detailTabs = [
    {
      key: 'byScope',
      label: t('account.usagePanel.byScope'),
      children: (
        <Table
          size="middle"
          rowKey="scope"
          loading={loading}
          dataSource={summary?.byScope ?? []}
          pagination={false}
          columns={[
            {
              title: t('account.usagePanel.scope'),
              dataIndex: 'scope',
              render: (v: string) => SCOPE_LABELS[v] ?? v,
            },
            {
              title: t('account.usagePanel.metricType'),
              dataIndex: 'metricKind',
              width: 88,
              render: (v: string) => (v === 'token' ? t('account.usagePanel.token') : t('account.usagePanel.count')),
            },
            {
              title: t('account.usagePanel.primaryUsage'),
              key: 'primary',
              render: (_: unknown, r: AccountUsageByScopeRow) => scopePrimaryMetric(r, t, dateLocale),
            },
            {
              title: t('account.usagePanel.inputToken'),
              dataIndex: 'inputTokens',
              width: 100,
              render: (v: number) => (v > 0 ? formatCompact(v) : '—'),
            },
            {
              title: t('account.usagePanel.outputToken'),
              dataIndex: 'outputTokens',
              width: 100,
              render: (v: number) => (v > 0 ? formatCompact(v) : '—'),
            },
            {
              title: t('account.usagePanel.mxmDeduct'),
              dataIndex: 'mxmTokenCharged',
              width: 100,
              render: (v: number) => formatToken(v),
            },
            { title: t('account.usagePanel.callCount'), dataIndex: 'providerCallCount', width: 88 },
          ]}
        />
      ),
    },
    {
      key: 'openApiSlug',
      label: t('account.usagePanel.openApiSection'),
      children: (
        <Table
          size="middle"
          rowKey="slug"
          loading={loading}
          dataSource={openApiSlugRows}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: t('account.usagePanel.noOpenApiCalls') }}
          columns={[
            {
              title: 'Slug',
              dataIndex: 'slug',
              render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
            },
            { title: t('account.usagePanel.providerCalls'), dataIndex: 'callCount', width: 110 },
            { title: t('account.usagePanel.graphImages'), dataIndex: 'imageCount', width: 88 },
            {
              title: t('account.usagePanel.writingTokens'),
              dataIndex: 'inputTokens',
              width: 100,
              render: (v: number) => formatCompact(v),
            },
            {
              title: t('account.usagePanel.mxmDeduct'),
              dataIndex: 'mxmTokenCharged',
              width: 100,
              render: (v: number) => formatToken(v),
            },
          ]}
        />
      ),
    },
    {
      key: 'openApiCaller',
      label: t('account.usagePanel.callerSection'),
      children: (
        <Table
          size="middle"
          rowKey="callerUserId"
          loading={loading}
          dataSource={summary?.openApi?.byCaller ?? []}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: t('account.usagePanel.noCallerData') }}
          columns={[
            {
              title: t('account.usagePanel.user'),
              key: 'user',
              render: (_: unknown, r) => r.username ?? `${r.callerUserId.slice(0, 8)}…`,
            },
            { title: t('account.usagePanel.providerCalls'), dataIndex: 'callCount', width: 110 },
            {
              title: t('account.usagePanel.mxmDeduct'),
              dataIndex: 'mxmTokenCharged',
              width: 100,
              render: (v: number) => formatToken(v),
            },
          ]}
        />
      ),
    },
    {
      key: 'recent',
      label: t('account.usagePanel.recentCalls'),
      children: (
        <Table
          size="middle"
          rowKey="id"
          loading={eventsLoading}
          dataSource={eventsItems}
          columns={recentColumns}
          pagination={{
            current: eventsPage,
            pageSize: eventsPageSize,
            total: eventsTotal,
            showSizeChanger: true,
            pageSizeOptions: [12, 20, 50],
            onChange: (page, pageSize) => {
              setEventsPage(page);
              if (pageSize !== eventsPageSize) {
                setEventsPageSize(pageSize);
                setEventsPage(1);
              }
            },
          }}
          scroll={{ x: 960 }}
        />
      ),
    },
  ];

  return (
    <div className="account-usage-panel openapi-usage-panel">
      <div className="console-toolbar openapi-usage-toolbar">
        <div className="openapi-usage-toolbar__filters">
          <Segmented
            className="openapi-usage-source-segmented"
            value={source}
            onChange={(v) => setSource(v as AccountUsageSourceFilter)}
            options={[
              { label: t('account.usagePanel.filterAll'), value: 'all' },
              { label: t('account.usagePanel.filterWeb'), value: 'web' },
              { label: t('account.usagePanel.filterOpenApi'), value: 'open_api' },
            ]}
          />
          <Select
            className="openapi-usage-toolbar__days"
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: t('account.usagePanel.last7Days') },
              { value: 30, label: t('account.usagePanel.last30Days') },
              { value: 90, label: t('account.usagePanel.last90Days') },
            ]}
          />
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading || eventsLoading}
          onClick={() => {
            void load();
            if (detailTab === 'recent') void loadEvents();
          }}
        >
          刷新
        </Button>
      </div>

      {loading && !summary ? (
        <div className="openapi-usage-loading">
          <BrandLoading tip={t('account.usagePanel.loading')} />
        </div>
      ) : (
        <>
          <section className="account-usage-kpi" aria-label={t('account.usagePanel.overview')}>
            <Card className="open-api-kpi-item account-usage-kpi-card account-usage-kpi-card--primary" bordered={false}>
              <Statistic
                title={t('account.usagePanel.mxmDeductTitle')}
                value={totals?.mxmTokenCharged ?? 0}
                precision={2}
                formatter={(v) => formatToken(Number(v))}
              />
              <Typography.Text type="secondary" className="account-usage-kpi-hint">
                近 {days} 天 · Provider 调用 {totals?.providerCallCount ?? 0} 次
              </Typography.Text>
            </Card>
            <Card className="open-api-kpi-item account-usage-kpi-card" bordered={false}>
              <Statistic title={t('account.usagePanel.writingTokenTitle')} value={writingTokens} formatter={(v) => formatCompact(Number(v))} />
              <Typography.Text type="secondary" className="account-usage-kpi-hint">
                {t('account.usagePanel.writingTokenHint')}
              </Typography.Text>
            </Card>
            <Card className="open-api-kpi-item account-usage-kpi-card" bordered={false}>
              <Statistic title={t('account.usagePanel.graphImagesTitle')} value={graphImages} formatter={(v) => formatCompact(Number(v))} />
              <Typography.Text type="secondary" className="account-usage-kpi-hint">
                {t('account.usagePanel.graphImagesHint')}
              </Typography.Text>
            </Card>
            <Card className="open-api-kpi-item account-usage-kpi-card" bordered={false}>
              <Statistic title={t('account.usagePanel.mediaTitle')} value={mediaRequests} />
              <Typography.Text type="secondary" className="account-usage-kpi-hint">
                视频 {totals?.videoRequests ?? 0} · 音频 {totals?.audioRequests ?? 0} · 音乐{' '}
                {totals?.musicRequests ?? 0}
              </Typography.Text>
            </Card>
          </section>

          {source === 'all' && summary ? (
            <div className="account-usage-source-row">
              <Tag className="account-usage-source-tag">
                自用 MXM {formatToken(summary.bySource.web.mxmTokenCharged)}
              </Tag>
              <Tag color="gold" className="account-usage-source-tag">
                第三方 MXM {formatToken(summary.bySource.open_api.mxmTokenCharged)}
              </Tag>
            </div>
          ) : null}

          <section className="openapi-usage-chart-section">
            <Card
              className="openapi-usage-chart-main page-table-card"
              bordered={false}
              title={t('account.usagePanel.trend')}
              extra={
                <Segmented
                  size="small"
                  className="openapi-usage-chart-toggle"
                  value={chartMetric}
                  onChange={(v) => setChartMetric(v as ChartMetric)}
                  options={[
                    { label: 'MXM 扣费', value: 'mxm' },
                    { label: 'Token', value: 'tokens' },
                    { label: '生图', value: 'images' },
                  ]}
                />
              }
            >
              {chartData.length > 0 ? (
                <div className="openapi-usage-chart-body">
                  <Area {...areaConfig} />
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('account.usagePanel.noCallsInRange')}
                  className="openapi-usage-chart-empty"
                />
              )}
            </Card>

            <Card className="openapi-usage-chart-side page-table-card" bordered={false} title={t('account.usagePanel.sourceDistribution')}>
              {(summary?.totals?.mxmTokenCharged ?? 0) > 0 ? (
                <Column {...sourceColumnConfig} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('account.usagePanel.noBilling')} />
              )}
            </Card>
          </section>

          <Card className="openapi-usage-detail page-table-card" bordered={false} title={t('account.usagePanel.detailData')}>
            <Tabs activeKey={detailTab} onChange={setDetailTab} items={detailTabs} />
          </Card>
        </>
      )}
    </div>
  );
}
