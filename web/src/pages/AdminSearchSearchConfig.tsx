import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Input,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tabs,
  Typography,
} from 'antd';
import { PlusCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { request } from '../api/client';
import { pageCardTitle } from '../components/PageHint';
import AdminDataSourceConfig from './AdminDataSourceConfig';

interface SearchConfigRow {
  name: string;
  enabled: boolean;
  apiKeys: string[];
  rateLimit: number;
  status: 'configured' | 'missing' | 'inactive' | 'keyless';
}

const PROVIDERS = [
  { name: 'brave', label: 'Brave Search', dimensions: 'general, news, social', free: '2500次/天' },
  { name: 'tavily', label: 'Tavily AI', dimensions: 'general, news, academic, forum, finance', free: '1000次/天' },
  {
    name: 'anysearch',
    label: 'AnySearch',
    dimensions: 'general, news, academic, forum, social, finance, official（垂域+全文抽取）',
    free: '约1000次/天',
  },
  { name: 'bocha', label: '博查 AI', dimensions: 'general, news, academic, forum', free: '国内可用' },
  { name: 'arxiv', label: 'ArXiv', dimensions: 'academic', free: '无限制' },
  { name: 'bing', label: 'Bing 必应', dimensions: 'general, news', free: '国内可用' },
  { name: 'serpapi', label: 'SerpAPI (Google)', dimensions: 'all', free: '付费' },
  { name: 'duckduckgo', label: 'DuckDuckGo', dimensions: 'general', free: '免费(国内服务器需代理)' },
];

/**
 * 搜索引擎配置管理
 */
export default function AdminSearchConfig() {
  const { message: msg } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<SearchConfigRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [addKeyModal, setAddKeyModal] = useState<{ open: boolean; provider: string; value: string }>({
    open: false,
    provider: '',
    value: '',
  });

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      // 从 mxmcgi 获取健康状态
      const healthRes = await request<{ status: string; providers?: Record<string, string> }>('/api/v1/search/health');
      const providers = healthRes.data?.providers;

      // 从 DB 读取配置
      const dbRes = await request<{ items?: SearchConfigRow[] }>('/api/v1/search/admin/search/config').catch(
        () => ({ data: undefined })
      );

      const items = dbRes.data?.items || [];

      // 合并健康状态和 DB 配置
      const merged = PROVIDERS.map((p) => {
        const dbConfig = items.find((i) => i.name === p.name);
        const health = providers?.[p.name];
        const keyless = p.name === 'arxiv' || p.name === 'duckduckgo';
        let status: SearchConfigRow['status'] = 'missing';
        if (health === 'configured' || (keyless && dbConfig?.enabled)) {
          status = keyless ? 'keyless' : 'configured';
        } else if (health === 'inactive' || (dbConfig && !dbConfig.enabled)) {
          status = 'inactive';
        } else if (health === 'always-available' && keyless) {
          status = dbConfig?.enabled ? 'keyless' : 'inactive';
        }
        return {
          name: p.name,
          enabled: dbConfig?.enabled ?? false,
          apiKeys: dbConfig?.apiKeys || [],
          rateLimit: dbConfig?.rateLimit || 0,
          status,
        };
      });

      setConfigs(merged);
    } catch (error) {
      console.error('[AdminSearchConfig] Load failed:', error);
      // 失败时使用默认空配置
      setConfigs(
        PROVIDERS.map((p) => ({
          name: p.name,
          enabled: false,
          apiKeys: [] as string[],
          rateLimit: 0,
          status: 'missing' as const,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const handleSave = async (name: string, values: Partial<SearchConfigRow>) => {
    setSaving(name);
    try {
      await request('/api/v1/search/admin/search/config', {
        method: 'POST',
        body: { task_key: name, ...values },
      });
      msg.success(`已保存 ${PROVIDERS.find((p) => p.name === name)?.label || name} 配置`);
      await loadConfigs();
    } catch (error) {
      msg.error(`保存失败: ${error}`);
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (name: string) => {
    setTesting(name);
    try {
      const res = await request<{ ok?: boolean; hitCount?: number; error?: string }>(
        `/api/v1/search/providers/${encodeURIComponent(name)}/test?q=test`
      );
      if (res.error || res.data?.ok === false) {
        msg.error(`测试失败: ${res.error || res.data?.error || '未知错误'}`);
      } else {
        const count = res.data?.hitCount ?? 0;
        msg.success(
          `${PROVIDERS.find((p) => p.name === name)?.label || name} 测试成功！返回 ${count} 条结果`
        );
      }
    } catch (error) {
      msg.error(`测试失败: ${error}`);
    } finally {
      setTesting(null);
    }
  };

  const handleSearchTest = async () => {
    const queryInput = document.getElementById('search-test-query') as HTMLInputElement;
    const depthSelect = document.getElementById('search-test-depth') as HTMLSelectElement;
    const query = queryInput?.value;
    const depth = depthSelect?.value || 'standard';

    if (!query) {
      msg.warning('请输入搜索关键词');
      return;
    }

    setTesting('test');
    try {
      const res = await request<{
        aggregated?: unknown[];
        topicType?: string;
        dimensionResults?: Record<string, { provider?: string; items?: unknown[]; total?: number }>;
      }>('/api/v1/search/auto', {
        method: 'POST',
        body: { query, depth },
      });
      const count = (res.data?.aggregated as unknown[])?.length || 0;
      const breakdown = Object.entries(res.data?.dimensionResults || {})
        .map(([dim, r]) => `${dim}→${r.provider ?? '?'}(${r.items?.length ?? r.total ?? 0})`)
        .join('，');
      msg.success(
        `返回 ${count} 条结果${breakdown ? `（${breakdown}）` : ''}${res.data?.topicType ? ` · topic: ${res.data.topicType}` : ''}`
      );
    } catch (error) {
      msg.error(`搜索失败: ${error}`);
    } finally {
      setTesting(null);
    }
  };

  const handleAddApiKey = (name: string) => {
    setAddKeyModal({ open: true, provider: name, value: '' });
  };

  const handleAddKeyConfirm = async () => {
    const { provider, value } = addKeyModal;
    if (!value.trim()) {
      msg.warning('请输入 API Key');
      return;
    }
    const config = configs.find((c) => c.name === provider);
    if (!config) return;
    const newKeys = [...config.apiKeys, value.trim()];
    await handleSave(provider, { apiKeys: newKeys });
    setAddKeyModal({ open: false, provider: '', value: '' });
  };

  const handleRemoveApiKey = (name: string, index: number) => {
    const config = configs.find((c) => c.name === name);
    if (!config) return;
    const newKeys = config.apiKeys.filter((_, i) => i !== index);
    void handleSave(name, { apiKeys: newKeys });
  };

  const columns = [
    {
      title: 'Provider',
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, record: SearchConfigRow) => {
        const p = PROVIDERS.find((x) => x.name === record.name);
        return (
          <Space>
            <Typography.Text strong>{p?.label || record.name}</Typography.Text>
            <Tag
              color={
                record.status === 'configured' || record.status === 'keyless'
                  ? 'green'
                  : record.status === 'inactive'
                    ? 'orange'
                    : 'default'
              }
            >
              {record.status === 'configured'
                ? '已配置'
                : record.status === 'keyless'
                  ? '免 Key'
                  : record.status === 'inactive'
                    ? '未启用'
                    : '未配置'}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: '支持维度',
      key: 'dimensions',
      render: (_: unknown, record: SearchConfigRow) => {
        const p = PROVIDERS.find((x) => x.name === record.name);
        return (
          <Typography.Text type="secondary">
            {p?.dimensions} (免费: {p?.free})
          </Typography.Text>
        );
      },
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: SearchConfigRow) => (
        <Switch
          checked={enabled}
          onChange={(checked) => {
            void handleSave(record.name, { enabled: checked });
          }}
          loading={saving === record.name}
        />
      ),
    },
    {
      title: 'API Keys',
      key: 'apiKeys',
      render: (_: unknown, record: SearchConfigRow) => {
        // ArXiv 和 DuckDuckGo 不需要 API Key
        if (record.name === 'arxiv' || record.name === 'duckduckgo') {
          return <Typography.Text type="secondary">无需 API Key</Typography.Text>;
        }
        return (
          <Space>
            <Typography.Text>{record.apiKeys.length} 个 Key</Typography.Text>
            <Button
              type="link"
              size="small"
              icon={<PlusCircleOutlined />}
              onClick={() => handleAddApiKey(record.name)}
            >
              管理
            </Button>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: SearchConfigRow) => (
        <Space>
          <Button size="small" onClick={() => void handleTest(record.name)} loading={testing === record.name}>
            测试
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 8px' }}>
      <Tabs
        defaultActiveKey="search"
        items={[
          {
            key: 'search',
            label: '搜索引擎',
            children: (
              <>
      <Card
        size="small"
        title={pageCardTitle('搜索引擎配置', {
          title: '配置说明',
          description: (
            <>
              <p>配置搜索引擎 API Key（Key 会加密存储，支持多 Key 轮询）。ArXiv 无需 API Key。</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {PROVIDERS.map((p) => (
                  <li key={p.name}>
                    {p.label}: {p.free}
                  </li>
                ))}
              </ul>
            </>
          ),
        })}
        extra={
          <Button size="small" onClick={() => void loadConfigs()} loading={loading}>
            刷新状态
          </Button>
        }
      >
        <Table dataSource={configs} columns={columns} rowKey="name" pagination={false} size="small" />
      </Card>

      <Card size="small" title="搜索测试" style={{ marginTop: 16 }}>
        <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
          <Input id="search-test-query" placeholder="输入搜索关键词" />
          <select
            id="search-test-depth"
            style={{ width: 100, border: '1px solid #d9d9d9', borderRadius: 6, padding: '2px 8px' }}
          >
            <option value="quick">快速</option>
            <option value="standard">标准</option>
            <option value="deep">深度</option>
          </select>
          <Button type="primary" onClick={() => void handleSearchTest()} loading={testing === 'test'}>
            搜索
          </Button>
        </Space.Compact>
      </Card>

      <Modal
        title={`API Keys - ${PROVIDERS.find((p) => p.name === addKeyModal.provider)?.label || addKeyModal.provider}`}
        open={addKeyModal.open}
        onCancel={() => setAddKeyModal({ open: false, provider: '', value: '' })}
        footer={null}
        width={520}
      >
        <div style={{ marginTop: 16 }}>
          {/* 已添加的 Key 列表 */}
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>已添加的 Key</Typography.Text>
          {(configs.find((c) => c.name === addKeyModal.provider)?.apiKeys || []).length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {configs.find((c) => c.name === addKeyModal.provider)?.apiKeys.map((key, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Typography.Text code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {key.slice(0, 8)}...{key.slice(-4)}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Key {idx + 1}</Typography.Text>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveApiKey(addKeyModal.provider, idx)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>暂无 API Key</Typography.Text>
          )}

          {/* 添加新 Key */}
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>添加新 Key</Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              placeholder="输入 API Key"
              value={addKeyModal.value}
              onChange={(e) => setAddKeyModal((prev) => ({ ...prev, value: e.target.value }))}
              onPressEnter={handleAddKeyConfirm}
              style={{ flex: 1 }}
            />
            <Button type="primary" onClick={handleAddKeyConfirm} loading={saving === addKeyModal.provider}>
              添加
            </Button>
          </Space.Compact>
        </div>
      </Modal>
              </>
            ),
          },
          {
            key: 'datasource',
            label: '专业数据源',
            children: <AdminDataSourceConfig />,
          },
        ]}
      />
    </div>
  );
}
