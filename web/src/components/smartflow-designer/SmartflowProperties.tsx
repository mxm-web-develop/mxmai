import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Switch, Typography, Collapse } from 'antd';
import type { Node } from '@xyflow/react';
import { BUSINESS_SCOPES, type SfCanvasData } from './schemaFlow';
import {
  getTaskFormConfig,
  getTaskFormConfigList,
  type TaskFormConfig,
  type TaskFormConfigListItem,
} from '../../api/client';
import { formatTaskSelectionKey, parseTaskSelectionKey } from '../../task-v2/taskSelection';

type Props = {
  node: Node<SfCanvasData> | null;
  /** 画布上全部节点，用于条件分支选择跳转目标并显示名称 */
  peerNodes: Node<SfCanvasData>[];
  onChange: (next: Record<string, unknown>) => void;
  onDelete: () => void;
};

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

/**
 * 获取 task 显示名称
 * 优先使用 API 返回的 taskLabel，否则显示原始 taskKey
 * （让 admin 必须配置 label）
 */
function getBeautifiedTaskLabel(taskLabel: string | null | undefined, taskKey: string): string {
  if (taskLabel) return taskLabel;
  return taskKey;
}

export function SmartflowProperties({ node, peerNodes, onChange, onDelete }: Props) {
  const sf = useMemo<Record<string, unknown> | null>(() => {
    if (!node) return null;
    const raw = node.data?.sfNode;
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    return { id: node.id, type: node.type ?? 'unknown', name: node.id };
  }, [node]);

  const t = String(sf?.type ?? '');

  // P1-5: JSON 字段实时校验状态
  const [eoError, setEoError] = useState<string>('');
  const [omError, setOmError] = useState<string>('');
  const [tpError, setTpError] = useState<string>('');

  // business_scope 兼容旧数据：service -> business_scope
  const effectiveScope = useMemo<string>(() => {
    const s = String(sf?.business_scope ?? '');
    if (s) return s;
    // 旧数据 migration: service 字段映射到 business_scope
    const old = String((sf as Record<string, unknown>)?.service ?? '');
    if (old === 'writing' || old === 'outline') return 'writing';
    if (old === 'graph') return 'graph';
    if (old === 'audio') return 'audio';
    if (old === 'video') return 'video';
    if (old === 'character') return 'character';
    if (old === 'knowledge') return 'knowledge';
    return '';
  }, [sf?.business_scope, (sf as Record<string, unknown>)?.service]);

  // 动态业务相关状态
  const [taskOptions, setTaskOptions] = useState<TaskFormConfigListItem[]>([]);
  const [taskOptionsLoading, setTaskOptionsLoading] = useState(false);
  const [formConfig, setFormConfig] = useState<TaskFormConfig | null>(null);
  const [formConfigLoading, setFormConfigLoading] = useState(false);

  const selectedTaskKey = String((sf as Record<string, unknown>)?.taskKey ?? '');
  const selectedSubtype = ((sf as Record<string, unknown>)?.subtype ?? null) as string | null;
  const selectedTaskSelectionKey = useMemo(() => {
    if (!selectedTaskKey) return undefined;
    return formatTaskSelectionKey(selectedTaskKey, selectedSubtype ?? null);
  }, [selectedTaskKey, selectedSubtype]);

  // 当 business_scope 或 scope 改变时，获取 taskKey 列表
  useEffect(() => {
    if (!effectiveScope) {
      setTaskOptions([]);
      setFormConfig(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setTaskOptionsLoading(true);
      try {
        const res = await getTaskFormConfigList({ scope: effectiveScope });
        const data =
          (res.data as { data?: { items: TaskFormConfigListItem[] } } | undefined)?.data ??
          (res.data as { items?: TaskFormConfigListItem[] } | undefined);
        const items = Array.isArray(data?.items) ? data!.items! : [];
        if (cancelled) return;
        setTaskOptions(items);
        // 自动选中第一个 taskKey
        if (!selectedTaskKey && items[0]) {
          setField('taskKey', items[0].taskKey);
          setField('subtype', items[0].subtype ?? null);
        }
      } catch {
        if (!cancelled) setTaskOptions([]);
      } finally {
        if (!cancelled) setTaskOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, effectiveScope]);

  // 当 taskKey/subtype 改变时，获取表单配置
  useEffect(() => {
    if (!effectiveScope || !selectedTaskKey) {
      setFormConfig(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setFormConfigLoading(true);
      try {
        const res = await getTaskFormConfig({
          scope: effectiveScope,
          taskKey: selectedTaskKey || 'default',
          ...(selectedSubtype ? { subtype: selectedSubtype } : {}),
        });
        const data =
          (res.data as { data?: TaskFormConfig } | undefined)?.data ??
          (res.data as TaskFormConfig | undefined);
        if (cancelled) return;
        setFormConfig(data?.schema ? data : null);
      } catch {
        if (!cancelled) setFormConfig(null);
      } finally {
        if (!cancelled) setFormConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, effectiveScope, selectedTaskKey, selectedSubtype]);

  const peerNodeOptions = useMemo(() => {
    return peerNodes
      .filter((n) => n.id !== node?.id)
      .map((n) => {
        const name = String(n.data?.sfNode?.name ?? n.id);
        return { value: n.id, label: `${name} (${n.id})` };
      });
  }, [peerNodes, node?.id]);

  const startInputs = useMemo(() => {
    if (t !== 'start' || !sf) return [];
    const arr = sf.input;
    return Array.isArray(arr) ? (arr as { name?: string; type?: string }[]) : [];
  }, [sf, t]);

  const setField = (key: string, value: unknown) => {
    if (!sf) return;
    onChange({ ...sf, [key]: value });
  };

  // ==================== 动态表单渲染（business / model 节点共用） ====================
  // 从 form-config schema 提取的当前参数值
  const currentParams = useMemo<Record<string, unknown>>(() => {
    return (sf?.params as Record<string, unknown>) ?? {};
  }, [sf?.params]);

  // 表单 schema properties
  const schemaProps = useMemo<Record<string, any>>(() => {
    return formConfig?.schema?.properties ?? {};
  }, [formConfig]);

  if (!node || !sf) {
    return (
      <div className="smartflow-props" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          未选择节点
        </Typography.Text>
      </div>
    );
  }

  // 渲染动态表单字段
  const renderDynamicFields = () => {
    if (formConfigLoading) {
      return (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          正在加载业务参数…
        </Typography.Text>
      );
    }
    if (!selectedTaskKey) {
      return (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          请先选择业务类型
        </Typography.Text>
      );
    }
    if (Object.keys(schemaProps).length === 0) {
      return (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          该业务暂无自定义参数
        </Typography.Text>
      );
    }
    return Object.entries(schemaProps).map(([k, prop]: [string, any]) => {
      const title = prop?.title ?? k;
      const desc = prop?.description;
      const fieldType = prop?.type ?? 'string';
      const enumValues = prop?.enum;
      const currentVal = currentParams[k];

      if (enumValues && Array.isArray(enumValues)) {
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            {title ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {title}
              </Typography.Text>
            ) : null}
            {desc ? (
              <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.8, display: 'block' }}>
                {desc}
              </Typography.Text>
            ) : null}
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={String(currentVal ?? '')}
              options={enumValues.map((v: string) => ({ value: v, label: v }))}
              onChange={(v) => setField('params', { ...currentParams, [k]: v })}
            />
          </div>
        );
      }
      if (fieldType === 'boolean') {
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            <Space>
              <Typography.Text style={{ fontSize: 12 }}>{title}</Typography.Text>
              <Switch
                size="small"
                checked={Boolean(currentVal)}
                onChange={(v) => setField('params', { ...currentParams, [k]: v })}
              />
            </Space>
            {desc ? (
              <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.8, display: 'block' }}>
                {desc}
              </Typography.Text>
            ) : null}
          </div>
        );
      }
      if (fieldType === 'array' && enumValues) {
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            {title ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {title}
              </Typography.Text>
            ) : null}
            {desc ? (
              <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.8, display: 'block' }}>
                {desc}
              </Typography.Text>
            ) : null}
            <Select
              size="small"
              mode="multiple"
              style={{ width: '100%', marginTop: 4 }}
              value={Array.isArray(currentVal) ? currentVal.map(String) : []}
              options={enumValues.map((v: string) => ({ value: v, label: v }))}
              onChange={(v) => setField('params', { ...currentParams, [k]: v })}
            />
          </div>
        );
      }
      // 默认：文本输入框
      return (
        <div key={k} style={{ marginBottom: 12 }}>
          {title ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {title}
            </Typography.Text>
          ) : null}
          {desc ? (
            <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.8, display: 'block' }}>
              {desc}
            </Typography.Text>
          ) : null}
          <Input
            size="small"
            style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace' }}
            placeholder={`例如 {{input.${k}}}`}
            value={String(currentVal ?? '')}
            onChange={(e) => setField('params', { ...currentParams, [k]: e.target.value })}
          />
        </div>
      );
    });
  };

  return (
    <div className="smartflow-props" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          节点 ID
        </Typography.Text>
        <Input size="small" value={String(sf.id ?? '')} disabled style={{ marginTop: 4 }} />
      </div>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          显示名称
        </Typography.Text>
        <Input
          size="small"
          value={String(sf.name ?? '')}
          onChange={(e) => setField('name', e.target.value)}
          style={{ marginTop: 4 }}
        />
      </div>

      {t === 'start' && (
        <>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              工作流标题（smartflow_name）
            </Typography.Text>
            <Input
              size="small"
              value={String(sf.smartflow_name ?? '')}
              onChange={(e) => setField('smartflow_name', e.target.value)}
              style={{ marginTop: 4 }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.7, display: 'block', marginTop: 2 }}>
              引擎内部引用名，用于 API 调用和日志标识
            </Typography.Text>
          </div>
          <Typography.Text strong style={{ fontSize: 12 }}>
            输入字段（input_data 的 key）
          </Typography.Text>
          {startInputs.map((row, idx) => (
            <Space key={idx} wrap style={{ width: '100%' }}>
              <Input
                size="small"
                placeholder="字段名"
                style={{ width: 100 }}
                value={row.name ?? ''}
                onChange={(e) => {
                  const next = clone(startInputs);
                  next[idx] = { ...next[idx], name: e.target.value };
                  setField('input', next);
                }}
              />
              <Select
                size="small"
                style={{ width: 100 }}
                value={row.type ?? 'text'}
                options={[
                  { value: 'text', label: 'text' },
                  { value: 'json', label: 'json' },
                ]}
                onChange={(v) => {
                  const next = clone(startInputs);
                  next[idx] = { ...next[idx], type: v };
                  setField('input', next);
                }}
              />
              <Button
                size="small"
                danger
                type="link"
                onClick={() => {
                  const next = startInputs.filter((_, i) => i !== idx);
                  setField('input', next);
                }}
              >
                删
              </Button>
            </Space>
          ))}
          <Button
            size="small"
            type="dashed"
            block
            onClick={() => setField('input', [...startInputs, { name: 'field', type: 'text', content: '' }])}
          >
            + 添加输入字段
          </Button>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              expected_outputs（JSON 数组）
            </Typography.Text>
            <Input.TextArea
              key={`eo-${String(sf.id)}`}
              rows={4}
              status={eoError ? 'error' : undefined}
              value={JSON.stringify(sf.expected_outputs ?? [], null, 2)}
              onChange={(e) => {
                try {
                  JSON.parse(e.target.value || '[]');
                  setEoError('');
                  setField('expected_outputs', JSON.parse(e.target.value || '[]'));
                } catch (err) {
                  setEoError((err as Error).message);
                }
              }}
              style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
            {eoError && <Typography.Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>JSON 语法错误：{eoError}</Typography.Text>}
          </div>
        </>
      )}

      {t === 'business' && (
        <>
          {/*
            v2 动态业务架构：
            - business_scope: 业务大类（writing/graph/audio/video 等）
            - taskKey: 具体业务标识，由 admin 在数据库创建
            - subtype: 细分类型（可选）
            - params: 动态参数，由 getTaskFormConfig 返回的 schema 定义
          */}

          {/* Step 1: 选择 business_scope */}
          <div style={{ position: 'relative', paddingLeft: 12, borderLeft: '2px solid rgba(139,92,246,0.2)', paddingBottom: 4, marginBottom: 4 }}>
            <span style={{ position: 'absolute', left: -9, top: 2, width: 16, height: 16, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>1</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              业务大类 (business_scope)
            </Typography.Text>
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={effectiveScope || undefined}
              options={BUSINESS_SCOPES.map((s) => ({ value: s.value, label: s.label }))}
              loading={taskOptionsLoading}
              onChange={(v) => {
                const newScope = v ?? '';
                const scopeLabel = newScope
                  ? BUSINESS_SCOPES.find((s) => s.value === newScope)?.label ?? newScope
                  : '业务节点';
                // 一次性更新所有字段，避免多次 setField 基于旧 sf 值的闭包问题
                onChange({
                  ...sf,
                  business_scope: newScope,
                  name: newScope ? `业务 · ${scopeLabel}` : '业务节点',
                  taskKey: '',
                  subtype: null,
                  params: {},
                });
              }}
              placeholder="选择业务大类"
            />
          </div>

          {/* Step 2: 选择 taskKey（动态从 v2 API 获取） */}
          {effectiveScope && (
            <div style={{ position: 'relative', paddingLeft: 12, borderLeft: '2px solid rgba(139,92,246,0.2)', paddingBottom: 4, marginBottom: 4 }}>
              <span style={{ position: 'absolute', left: -9, top: 2, width: 16, height: 16, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>2</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                业务类型 (taskKey)
              </Typography.Text>
              <Select
                size="small"
                style={{ width: '100%', marginTop: 4 }}
                value={selectedTaskSelectionKey}
                options={taskOptions.map((item) => ({
                  value: formatTaskSelectionKey(item.taskKey, item.subtype ?? null),
                  label: getBeautifiedTaskLabel(item.taskLabel, item.taskKey),
                }))}
                loading={taskOptionsLoading}
                onChange={(v) => {
                  if (!v) {
                    setField('taskKey', '');
                    setField('subtype', null);
                    return;
                  }
                  const parsed = parseTaskSelectionKey(v);
                  setField('taskKey', parsed.taskKey);
                  setField('subtype', parsed.subtype);
                  // P2-11: taskKey 变化时同步更新节点名称
                  setField('name', `业务 · ${getBeautifiedTaskLabel(parsed.taskKey, parsed.taskKey)}`);
                  // 重置 params
                  setField('params', {});
                }}
                placeholder="选择具体业务"
                allowClear
              />
            </div>
          )}

          {/* Step 3: 动态渲染参数表单（根据 form-config schema） */}
          {effectiveScope && selectedTaskKey && (
            <div style={{ position: 'relative', paddingLeft: 12, borderLeft: '2px solid rgba(139,92,246,0.2)', paddingBottom: 4 }}>
              <span style={{ position: 'absolute', left: -9, top: 2, width: 16, height: 16, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>3</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                业务参数 (params)
              </Typography.Text>
              <Collapse
                ghost
                size="small"
                style={{ marginTop: 4 }}
                items={[{
                  key: 'var-help',
                  label: <Typography.Text type="secondary" style={{ fontSize: 11 }}>📋 变量引用说明</Typography.Text>,
                  children: (
                    <div style={{ background: 'rgba(139,92,246,0.05)', borderRadius: 6, padding: '8px 10px' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        输入变量：<Typography.Text code copyable style={{ fontSize: 11 }}>{'{{input.xxx}}'}</Typography.Text>
                      </Typography.Text>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        节点输出：<Typography.Text code copyable style={{ fontSize: 11 }}>{'{{nodeId.output.xxx}}'}</Typography.Text>
                      </Typography.Text>
                    </div>
                  ),
                }]}
              />
              {renderDynamicFields()}
            </div>
          )}
        </>
      )}

      {t === 'model' && (
        <>
          {/* LLM 模型节点：可选择 v2 动态业务（通过 business_scope+taskKey）或直接配置 prompt */}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              business_scope（用于 v2 动态业务，可为空）
            </Typography.Text>
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={effectiveScope || undefined}
              options={BUSINESS_SCOPES.map((s) => ({ value: s.value, label: s.label }))}
              loading={taskOptionsLoading}
              onChange={(v) => {
                const newScope = v ?? '';
                // 一次性更新所有字段
                onChange({
                  ...sf,
                  business_scope: newScope,
                  taskKey: '',
                  subtype: null,
                  params: {},
                });
              }}
              placeholder="选择业务 scope（可选）"
              allowClear
            />
          </div>

          {effectiveScope && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                业务类型 (taskKey)
              </Typography.Text>
              <Select
                size="small"
                style={{ width: '100%', marginTop: 4 }}
                value={selectedTaskSelectionKey}
                options={taskOptions.map((item) => ({
                  value: formatTaskSelectionKey(item.taskKey, item.subtype ?? null),
                  label: getBeautifiedTaskLabel(item.taskLabel, item.taskKey),
                }))}
                loading={taskOptionsLoading}
                onChange={(v) => {
                  if (!v) { setField('taskKey', ''); setField('subtype', null); return; }
                  const parsed = parseTaskSelectionKey(v);
                  setField('taskKey', parsed.taskKey);
                  setField('subtype', parsed.subtype);
                  // P2-11: taskKey 变化时同步更新节点名称
                  setField('name', `LLM · ${getBeautifiedTaskLabel(parsed.taskKey, parsed.taskKey)}`);
                  setField('params', {});
                }}
                placeholder="选择具体业务"
                allowClear
              />
            </div>
          )}

          {effectiveScope && selectedTaskKey && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                业务参数 (params)
              </Typography.Text>
              <Collapse
                ghost
                size="small"
                style={{ marginTop: 4 }}
                items={[{
                  key: 'var-help',
                  label: <Typography.Text type="secondary" style={{ fontSize: 11 }}>📋 变量引用说明</Typography.Text>,
                  children: (
                    <div style={{ background: 'rgba(59,130,246,0.05)', borderRadius: 6, padding: '8px 10px' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        输入变量：<Typography.Text code copyable style={{ fontSize: 11 }}>{'{{input.xxx}}'}</Typography.Text>
                      </Typography.Text>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        节点输出：<Typography.Text code copyable style={{ fontSize: 11 }}>{'{{nodeId.output.xxx}}'}</Typography.Text>
                      </Typography.Text>
                    </div>
                  ),
                }]}
              />
              {renderDynamicFields()}
            </div>
          )}
        </>
      )}

      {t === 'end' && (
        <>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              output_mapping（JSON：输出名 → 模板）
            </Typography.Text>
            <Input.TextArea
              rows={6}
              status={omError ? 'error' : undefined}
              value={JSON.stringify(sf.output_mapping ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  JSON.parse(e.target.value || '{}');
                  setOmError('');
                  setField('output_mapping', JSON.parse(e.target.value || '{}'));
                } catch (err) {
                  setOmError((err as Error).message);
                }
              }}
              style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
            {omError && <Typography.Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>JSON 语法错误：{omError}</Typography.Text>}
          </div>
          <Space>
            <Typography.Text type="secondary">校验输出 validate_outputs</Typography.Text>
            <Switch
              checked={Boolean(sf.validate_outputs)}
              onChange={(v) => setField('validate_outputs', v)}
            />
          </Space>
        </>
      )}

      {t === 'condition' && (
        <>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            条件节点根据表达式选择下一跳；请填写目标节点 ID（须已在画布中存在）。
          </Typography.Paragraph>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              if（表达式，引用 input / 上游 {'{{'}node.output{'}}'})
            </Typography.Text>
            <Input
              size="small"
              value={String(sf.if ?? '')}
              onChange={(e) => setField('if', e.target.value)}
              placeholder="例如 {{nodeId.output.score}} > 0.8"
              style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace' }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.7, display: 'block', marginTop: 2 }}>
              当前值预览：<Typography.Text style={{ fontFamily: 'ui-monospace, monospace' }} copyable={{ text: String(sf.if ?? '') }}>{String(sf.if ?? '') || '(空)'}</Typography.Text>
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              then → 节点 ID
            </Typography.Text>
            <Select
              size="small"
              showSearch
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择节点"
              value={(sf.then as string) || undefined}
              options={peerNodeOptions}
              onChange={(v) => setField('then', v ?? '')}
            />
          </div>
          <Typography.Text strong style={{ fontSize: 12 }}>
            else_if（多分支）
          </Typography.Text>
          {(
            (Array.isArray(sf.else_if) ? sf.else_if : []) as { condition?: string; then?: string }[]
          ).map((row, idx) => (
            <Space key={idx} wrap style={{ width: '100%', marginBottom: 6 }}>
              <Input
                size="small"
                placeholder="condition"
                style={{ width: 120 }}
                value={row.condition ?? ''}
                onChange={(e) => {
                  const arr = clone(
                    (Array.isArray(sf.else_if) ? sf.else_if : []) as { condition: string; then: string }[]
                  );
                  arr[idx] = { ...arr[idx], condition: e.target.value };
                  setField('else_if', arr);
                }}
              />
              <Select
                size="small"
                showSearch
                style={{ width: 140 }}
                placeholder="then 节点"
                value={row.then ?? undefined}
                options={peerNodeOptions}
                onChange={(v) => {
                  const arr = clone(
                    (Array.isArray(sf.else_if) ? sf.else_if : []) as { condition: string; then: string }[]
                  );
                  arr[idx] = { ...arr[idx], then: v ?? '' };
                  setField('else_if', arr);
                }}
              />
              <Button
                size="small"
                type="link"
                danger
                onClick={() => {
                  const arr = (
                    (Array.isArray(sf.else_if) ? sf.else_if : []) as { condition: string; then: string }[]
                  ).filter((_, i) => i !== idx);
                  setField('else_if', arr);
                }}
              >
                删
              </Button>
            </Space>
          ))}
          <Button
            size="small"
            type="dashed"
            block
            onClick={() =>
              setField('else_if', [
                ...((Array.isArray(sf.else_if) ? sf.else_if : []) as object[]),
                { condition: 'true', then: '' },
              ])
            }
          >
            + 添加 else_if 分支
          </Button>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              else → 节点 ID（均不匹配时）
            </Typography.Text>
            <Select
              size="small"
              showSearch
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              value={(sf.else as string) || undefined}
              options={peerNodeOptions}
              onChange={(v) => setField('else', v ?? '')}
            />
          </div>
        </>
      )}

      {t === 'tools' && (
        <>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              tool_type
            </Typography.Text>
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={String(sf.tool_type ?? 'web_search')}
              options={[
                { value: 'web_search', label: 'web_search' },
                { value: 'web_scraper', label: 'web_scraper' },
                { value: 'embedding', label: 'embedding' },
                { value: 'http_request', label: 'http_request' },
                { value: 'code_executor', label: 'code_executor' },
                { value: 'custom', label: 'custom' },
              ]}
              onChange={(v) => setField('tool_type', v)}
            />
          </div>
          {String(sf.tool_type ?? '') === 'code_executor' && (
            <>
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  custom_language
                </Typography.Text>
                <Select
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  value={String(sf.custom_language ?? 'javascript')}
                  options={[
                    { value: 'javascript', label: 'javascript (Node.js)' },
                    { value: 'python', label: 'python' },
                  ]}
                  onChange={(v) => setField('custom_language', v)}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  custom_nl_prompt（可选，给执行器的自然语言指令）
                </Typography.Text>
                <Input.TextArea
                  rows={2}
                  value={String(sf.custom_nl_prompt ?? '')}
                  onChange={(e) => setField('custom_nl_prompt', e.target.value)}
                  style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  custom_code
                </Typography.Text>
                <Input.TextArea
                  rows={8}
                  value={String(sf.custom_code ?? '')}
                  onChange={(e) => setField('custom_code', e.target.value)}
                  style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
                />
              </div>
            </>
          )}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              tool_params（JSON）
            </Typography.Text>
            <Input.TextArea
              rows={6}
              status={tpError ? 'error' : undefined}
              value={JSON.stringify(sf.tool_params ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  JSON.parse(e.target.value || '{}');
                  setTpError('');
                  setField('tool_params', JSON.parse(e.target.value || '{}'));
                } catch (err) {
                  setTpError((err as Error).message);
                }
              }}
              style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
            />
            {tpError && <Typography.Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>JSON 语法错误：{tpError}</Typography.Text>}
          </div>
        </>
      )}

      {t === 'variable' && (
        <>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              操作类型
            </Typography.Text>
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={String(sf.operation ?? 'select')}
              options={[
                { value: 'select', label: 'Select（提取字段）' },
                { value: 'assign', label: 'Assign（直接赋值）' },
                { value: 'map', label: 'Map（数组映射）' },
                { value: 'filter', label: 'Filter（数组过滤）' },
                { value: 'reduce', label: 'Reduce（聚合）' },
              ]}
              onChange={(v) => setField('operation', v)}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              源节点字段（支持 {'{{'}nodeId.output.field{'}}'}）
            </Typography.Text>
            <Input
              size="small"
              value={String(sf.source_path ?? '')}
              onChange={(e) => setField('source_path', e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              保存为变量名
            </Typography.Text>
            <Input
              size="small"
              value={String(sf.output_name ?? '')}
              onChange={(e) => setField('output_name', e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              默认值
            </Typography.Text>
            <Input
              size="small"
              value={String(sf.default_value ?? '')}
              onChange={(e) => setField('default_value', e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
        </>
      )}

      {t === 'loop' && (
        <>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              循环模式
            </Typography.Text>
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={String(sf.loop_mode ?? 'iteration')}
              options={[
                { value: 'iteration', label: 'Iteration（for-each，遍历数组）' },
                { value: 'loop', label: 'Loop（while，条件循环）' },
              ]}
              onChange={(v) => setField('loop_mode', v)}
            />
          </div>
          {sf.loop_mode === 'iteration' && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                迭代数组（支持 {'{{'}nodeId.output.items{'}}'}）
              </Typography.Text>
              <Input.TextArea
                size="small"
                rows={2}
                value={String(sf.iterable ?? '')}
                onChange={(e) => setField('iterable', e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          )}
          {sf.loop_mode === 'loop' && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                循环条件（如 {'{{'}counter{'}}'} {'<'} 10）
              </Typography.Text>
              <Input
                size="small"
                value={String(sf.condition ?? '')}
                onChange={(e) => setField('condition', e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              单项变量名
            </Typography.Text>
            <Input
              size="small"
              value={String(sf.item_variable ?? 'item')}
              onChange={(e) => setField('item_variable', e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              最大迭代次数
            </Typography.Text>
            <Input
              size="small"
              type="number"
              value={Number(sf.max_iterations ?? 10)}
              onChange={(e) => setField('max_iterations', Number(e.target.value))}
              style={{ marginTop: 4 }}
            />
          </div>
          <Space style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              收集输出
            </Typography.Text>
            <Switch checked={Boolean(sf.collect_output)} onChange={(v) => setField('collect_output', v)} />
          </Space>
          {sf.collect_output && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                输出变量名
              </Typography.Text>
              <Input
                size="small"
                value={String(sf.output_variable ?? 'results')}
                onChange={(e) => setField('output_variable', e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          )}
        </>
      )}

      <Button danger size="small" onClick={onDelete}>
        从画布移除此节点
      </Button>
    </div>
  );
}
