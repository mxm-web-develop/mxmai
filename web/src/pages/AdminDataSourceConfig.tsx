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
  Typography,
} from 'antd';
import { PlusCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { request } from '../api/client';
import { pageCardTitle } from '../components/PageHint';

interface DataSourceConfigRow {
  name: string;
  enabled: boolean;
  apiKeys: string[];
  rateLimit: number;
  status: 'configured' | 'missing' | 'inactive' | 'keyless';
}

const DATA_SOURCE_PROVIDERS = [
  { name: 'coingecko', label: 'CoinGecko', domain: 'crypto', free: '免费 Demo 30次/分' },
  { name: 'defillama', label: 'DefiLlama', domain: 'crypto', free: '完全免费' },
  { name: 'finnhub', label: 'Finnhub', domain: 'stock', free: '60次/分，300次/天' },
  { name: 'pkulaw', label: '北大法宝 MCP', domain: 'legal', free: '企业付费' },
  { name: 'tianyancha', label: '天眼查', domain: 'business', free: '按次/套餐' },
];

export default function AdminDataSourceConfig() {
  const { message: msg } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<DataSourceConfigRow[]>([]);
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
      const healthRes = await request<{ providers?: Record<string, string> }>('/api/v1/search/datasource/health');
      const providers = healthRes.data?.providers;
      const dbRes = await request<{ items?: DataSourceConfigRow[] }>('/api/v1/search/admin/datasource/config').catch(
        () => ({ data: undefined })
      );
      const items = dbRes.data?.items || [];

      const merged = DATA_SOURCE_PROVIDERS.map((p) => {
        const dbConfig = items.find((i) => i.name === p.name);
        const health = providers?.[p.name];
        const keyless = p.name === 'coingecko' || p.name === 'defillama';
        let status: DataSourceConfigRow['status'] = 'missing';
        if (health === 'configured' || (keyless && health === 'keyless')) {
          status = keyless ? 'keyless' : 'configured';
        } else if (health === 'inactive' || (dbConfig && !dbConfig.enabled)) {
          status = 'inactive';
        }
        return {
          name: p.name,
          enabled: dbConfig?.enabled ?? keyless,
          apiKeys: dbConfig?.apiKeys || [],
          rateLimit: dbConfig?.rateLimit || 0,
          status,
        };
      });
      setConfigs(merged);
    } catch (error) {
      console.error('[AdminDataSourceConfig] Load failed:', error);
      setConfigs(
        DATA_SOURCE_PROVIDERS.map((p) => ({
          name: p.name,
          enabled: p.name === 'coingecko' || p.name === 'defillama',
          apiKeys: [] as string[],
          rateLimit: 0,
          status: (p.name === 'coingecko' || p.name === 'defillama' ? 'keyless' : 'missing') as const,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const handleSave = async (name: string, values: Partial<DataSourceConfigRow>) => {
    setSaving(name);
    try {
      await request('/api/v1/search/admin/datasource/config', {
        method: 'POST',
        body: { task_key: name, ...values },
      });
      msg.success(`已保存 ${DATA_SOURCE_PROVIDERS.find((p) => p.name === name)?.label || name} 配置`);
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
      const res = await request<{ ok?: boolean; summary?: string; error?: string }>(
        `/api/v1/search/datasource/providers/${encodeURIComponent(name)}/test`
      );
      if (res.error || res.data?.ok === false) {
        msg.error(`测试失败: ${res.error || res.data?.error || '未知错误'}`);
      } else {
        msg.success(`${DATA_SOURCE_PROVIDERS.find((p) => p.name === name)?.label || name} 测试成功`);
      }
    } catch (error) {
      msg.error(`测试失败: ${error}`);
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
    await handleSave(provider, { apiKeys: [...config.apiKeys, value.trim()] });
    setAddKeyModal({ open: false, provider: '', value: '' });
  };

  const handleRemoveApiKey = (name: string, index: number) => {
    const config = configs.find((c) => c.name === name);
    if (!config) return;
    void handleSave(name, { apiKeys: config.apiKeys.filter((_, i) => i !== index) });
  };

  const columns = [
    {
      title: '数据源',
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, record: DataSourceConfigRow) => {
        const p = DATA_SOURCE_PROVIDERS.find((x) => x.name === record.name);
        return (
          <Space>
            <Typography.Text strong>{p?.label || record.name}</Typography.Text>
            <Tag color={record.status === 'configured' || record.status === 'keyless' ? 'green' : record.status === 'inactive' ? 'orange' : 'default'}>
              {record.status === 'configured' ? '已配置' : record.status === 'keyless' ? '免 Key' : record.status === 'inactive' ? '未启用' : '未配置'}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: '领域',
      key: 'domain',
      render: (_: unknown, record: DataSourceConfigRow) => {
        const p = DATA_SOURCE_PROVIDERS.find((x) => x.name === record.name);
        return <Typography.Text type="secondary">{p?.domain} (免费: {p?.free})</Typography.Text>;
      },
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: DataSourceConfigRow) => (
        <Switch checked={enabled} onChange={(checked) => void handleSave(record.name, { enabled: checked })} loading={saving === record.name} />
      ),
    },
    {
      title: 'API Keys',
      key: 'apiKeys',
      render: (_: unknown, record: DataSourceConfigRow) => {
        if (record.name === 'coingecko' || record.name === 'defillama') {
          return <Typography.Text type="secondary">无需 API Key</Typography.Text>;
        }
        return (
          <Space>
            <Typography.Text>{record.apiKeys.length} 个 Key</Typography.Text>
            <Button type="link" size="small" icon={<PlusCircleOutlined />} onClick={() => handleAddApiKey(record.name)}>
              管理
            </Button>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: DataSourceConfigRow) => (
        <Button size="small" onClick={() => void handleTest(record.name)} loading={testing === record.name}>
          测试
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 8px' }}>
      <Card
        size="small"
        title={pageCardTitle('专业数据源配置', {
          title: '配置说明',
          description: (
            <>
              <p>配置法律/金融/股市/区块链/商业等专业 API。CoinGecko 与 DefiLlama 默认可用。</p>
              <p>北大法宝需在 extra 中配置 mcp_service_id；天眼查使用 Authorization Token。</p>
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

      <Modal
        title={`API Keys - ${DATA_SOURCE_PROVIDERS.find((p) => p.name === addKeyModal.provider)?.label || addKeyModal.provider}`}
        open={addKeyModal.open}
        onCancel={() => setAddKeyModal({ open: false, provider: '', value: '' })}
        footer={null}
        width={520}
      >
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>已添加的 Key</Typography.Text>
          {(configs.find((c) => c.name === addKeyModal.provider)?.apiKeys || []).map((key, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Typography.Text code style={{ flex: 1 }}>{key.slice(0, 8)}...{key.slice(-4)}</Typography.Text>
              <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleRemoveApiKey(addKeyModal.provider, idx)} />
            </div>
          ))}
          <Space.Compact style={{ width: '100%', marginTop: 12 }}>
            <Input.Password placeholder="输入 API Key" value={addKeyModal.value} onChange={(e) => setAddKeyModal((prev) => ({ ...prev, value: e.target.value }))} onPressEnter={handleAddKeyConfirm} style={{ flex: 1 }} />
            <Button type="primary" onClick={handleAddKeyConfirm} loading={saving === addKeyModal.provider}>添加</Button>
          </Space.Compact>
        </div>
      </Modal>
    </div>
  );
}
