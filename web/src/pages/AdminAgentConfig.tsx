/**
 * 系统管理 · AI 助手配置（仅 Admin）
 * - 推理模型 provider / model
 * - 可调用业务白名单
 * - loop / 超时 / 工具 / Smartflow
 * - 欢迎语 / 全局规则（system_prompt_extra）
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  message,
} from 'antd';
import BrandLoading from '../components/BrandLoading';
import {
  getAdminModelConfig,
  putAdminModelConfig,
  getAdminModelOptions,
  getTaskFormConfigList,
  type AdminModelConfigData,
  type ModelOption,
  type TaskFormConfigListItem,
} from '../api/client';

const SCOPES = ['writing', 'graph', 'video', 'audio', 'music', 'text'] as const;

type BizItem = {
  key: string;
  scope: string;
  taskKey: string;
  subtype: string | null;
  label: string;
};

function bizKey(scope: string, taskKey: string, subtype?: string | null): string {
  return `${scope}::${taskKey}::${subtype || ''}`;
}

export default function AdminAgentConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AdminModelConfigData | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [businesses, setBusinesses] = useState<BizItem[]>([]);
  const [allowMode, setAllowMode] = useState<'all' | 'whitelist'>('all');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, optRes] = await Promise.all([getAdminModelConfig(), getAdminModelOptions()]);
      const cfg = cfgRes.data?.data || null;
      const options = optRes.data?.data || [];
      setModelOptions(options);

      // provider 未落库时，按 model_key 从可选项推断，避免展示 maxplan 却保存成 null
      let next = cfg || {
        model_key: '',
        provider: null,
        temperature: 0.7,
        max_tokens: null,
        top_p: null,
        frequency_penalty: null,
        presence_penalty: null,
        max_loop_rounds: 12,
        run_timeout_ms: 600000,
        system_prompt_extra: '',
        welcome_message: '',
        tools_enabled: true,
        allowed_businesses: null,
        smartflow_enabled: true,
      };
      if (next.model_key && !next.provider) {
        const hit = options.find((o) => o.model_key === next.model_key);
        if (hit?.provider) next = { ...next, provider: hit.provider };
      }
      setConfig(next);

      if (cfg?.allowed_businesses == null) {
        setAllowMode('all');
        setSelectedKeys([]);
      } else {
        setAllowMode('whitelist');
        setSelectedKeys(
          cfg.allowed_businesses.map((b) => bizKey(b.scope, b.taskKey, b.subtype))
        );
      }

      const items: BizItem[] = [];
      for (const scope of SCOPES) {
        try {
          const listRes = await getTaskFormConfigList({ scope });
          const rows = listRes.data?.data?.items || [];
          for (const it of rows as TaskFormConfigListItem[]) {
            items.push({
              key: bizKey(scope, it.taskKey, it.subtype),
              scope,
              taskKey: it.taskKey,
              subtype: it.subtype,
              label: it.taskLabel || it.subtypeLabel || `${scope}/${it.taskKey}${it.subtype ? '/' + it.subtype : ''}`,
            });
          }
        } catch {
          /* skip */
        }
      }
      setBusinesses(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const modelSelectOptions = useMemo(
    () =>
      modelOptions.map((m) => ({
        value: `${m.provider}::${m.model_key}`,
        label: `${m.display_name || m.model_key} · ${m.provider}`,
        model_key: m.model_key,
        provider: m.provider,
      })),
    [modelOptions]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, BizItem[]>();
    for (const b of businesses) {
      const list = map.get(b.scope) || [];
      list.push(b);
      map.set(b.scope, list);
    }
    return [...map.entries()];
  }, [businesses]);

  const save = async () => {
    if (!config?.model_key) {
      message.error('请选择推理模型');
      return;
    }
    setSaving(true);
    try {
      const allowed =
        allowMode === 'all'
          ? null
          : selectedKeys.map((k) => {
              const [scope, taskKey, subtype] = k.split('::');
              return { scope, taskKey, subtype: subtype || null };
            });

      const res = await putAdminModelConfig({
        ...config,
        model_key: config.model_key,
        provider: config.provider || null,
        allowed_businesses: allowed,
      });
      if (res.error) throw new Error(res.error);
      if (res.data?.data) setConfig(res.data.data);
      message.success('AI 助手配置已保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-ops-loading">
        <BrandLoading size="large" tip="加载 AI 助手配置…" />
      </div>
    );
  }

  if (!config) {
    return <Alert type="error" title={error || '无法加载配置'} />;
  }

  return (
    <div className="admin-ops-section admin-agent-config">
      {error && <Alert type="warning" title={error} style={{ marginBottom: 12 }} />}

      <Card size="small" className="admin-ops-card" title="推理模型" style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>
              Provider / 模型（仅列出支持工具调用的文本模型）
            </div>
            <Select
              style={{ width: '100%', maxWidth: 560 }}
              showSearch
              optionFilterProp="label"
              value={
                config.provider
                  ? `${config.provider}::${config.model_key}`
                  : modelSelectOptions.find((o) => o.model_key === config.model_key)?.value ||
                    config.model_key
              }
              options={modelSelectOptions}
              onChange={(_v, opt) => {
                const o = opt as { model_key?: string; provider?: string };
                setConfig({
                  ...config,
                  model_key: o.model_key || config.model_key,
                  provider: o.provider || null,
                });
              }}
            />
          </div>
          <Space wrap size={16}>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>
                Temperature
              </div>
              <InputNumber
                min={0}
                max={2}
                step={0.1}
                value={config.temperature}
                onChange={(v) => setConfig({ ...config, temperature: Number(v) || 0.7 })}
              />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>
                Max tokens
              </div>
              <InputNumber
                min={256}
                max={128000}
                value={config.max_tokens ?? undefined}
                onChange={(v) => setConfig({ ...config, max_tokens: v == null ? null : Number(v) })}
              />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>
                最大 Loop 轮数
              </div>
              <InputNumber
                min={1}
                max={30}
                value={config.max_loop_rounds ?? 12}
                onChange={(v) => setConfig({ ...config, max_loop_rounds: Number(v) || 12 })}
              />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>
                Run 超时 (ms)
              </div>
              <InputNumber
                min={60000}
                step={60000}
                value={config.run_timeout_ms ?? 600000}
                onChange={(v) => setConfig({ ...config, run_timeout_ms: Number(v) || 600000 })}
              />
            </div>
          </Space>
        </Space>
      </Card>

      <Card size="small" className="admin-ops-card" title="能力开关" style={{ marginBottom: 12 }}>
        <Space size={24} wrap>
          <span>
            启用工具调用{' '}
            <Switch
              checked={config.tools_enabled !== false}
              onChange={(c) => setConfig({ ...config, tools_enabled: c })}
            />
          </span>
          <span>
            允许调用 Smartflow{' '}
            <Switch
              checked={config.smartflow_enabled !== false}
              onChange={(c) => setConfig({ ...config, smartflow_enabled: c })}
            />
          </span>
        </Space>
      </Card>

      <Card
        size="small"
        className="admin-ops-card"
        title="可调用业务"
        extra={
          <Select
            value={allowMode}
            style={{ width: 200 }}
            options={[
              { value: 'all', label: '全部业务（默认）' },
              { value: 'whitelist', label: '仅白名单业务' },
            ]}
            onChange={(v) => {
              setAllowMode(v);
              if (v === 'all') setSelectedKeys([]);
            }}
          />
        }
        style={{ marginBottom: 12 }}
      >
        {allowMode === 'all' ? (
          <div className="muted">助手可发现并调用系统中所有已上线业务。</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 8 }}>
              勾选后助手只能调用这些业务；未勾选则不可调用。
            </div>
            <Collapse
              size="small"
              items={grouped.map(([scope, items]) => {
                const keys = items.map((i) => i.key);
                const allChecked = keys.every((k) => selectedKeys.includes(k));
                const someChecked = keys.some((k) => selectedKeys.includes(k));
                return {
                  key: scope,
                  label: (
                    <Space>
                      <Checkbox
                        checked={allChecked}
                        indeterminate={someChecked && !allChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedKeys((prev) => {
                            if (e.target.checked) {
                              return [...new Set([...prev, ...keys])];
                            }
                            return prev.filter((k) => !keys.includes(k));
                          });
                        }}
                      />
                      <span>
                        {scope}（{items.length}）
                      </span>
                    </Space>
                  ),
                  children: (
                    <Checkbox.Group
                      style={{ width: '100%' }}
                      value={selectedKeys.filter((k) => keys.includes(k))}
                      onChange={(vals) => {
                        setSelectedKeys((prev) => {
                          const others = prev.filter((k) => !keys.includes(k));
                          return [...others, ...(vals as string[])];
                        });
                      }}
                    >
                      <Space direction="vertical">
                        {items.map((it) => (
                          <Checkbox key={it.key} value={it.key}>
                            {it.label}
                            <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                              {it.scope}/{it.taskKey}
                              {it.subtype ? `/${it.subtype}` : ''}
                            </span>
                          </Checkbox>
                        ))}
                      </Space>
                    </Checkbox.Group>
                  ),
                };
              })}
            />
          </>
        )}
      </Card>

      <Card size="small" className="admin-ops-card" title="欢迎语" style={{ marginBottom: 12 }}>
        <Input.TextArea
          rows={3}
          placeholder="有什么我可以帮你的？"
          value={config.welcome_message || ''}
          onChange={(e) => setConfig({ ...config, welcome_message: e.target.value })}
        />
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          显示在对话页空态；留空则使用默认文案。
        </div>
      </Card>

      <Card size="small" className="admin-ops-card" title="全局规则" style={{ marginBottom: 12 }}>
        <Input.TextArea
          rows={8}
          placeholder={`示例：
和本平台系统任务不相关的问题只简单回答：「这不属于我的工作内容，请您询问其他通用型 AI。」
涉及医疗、法律等专业诊断时，提醒用户以专业人士意见为准。
回答尽量使用 Markdown：表格、列表、代码块。`}
          value={config.system_prompt_extra || ''}
          onChange={(e) => setConfig({ ...config, system_prompt_extra: e.target.value })}
        />
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          写入助手 system prompt 的「全局规则（必须遵守）」段，控制推理边界与拒答策略。保存后 API
          侧立即生效；执行端（worker）最多约 30 秒内对新对话生效。
        </div>
      </Card>

      <Space>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存配置
        </Button>
        <Button onClick={() => void load()}>重新加载</Button>
      </Space>
    </div>
  );
}
