/**
 * Admin：提示词工程
 * 按业务 (scope/type/subtype) 查看当前接口在使用的提示词；输出格式与扩展配置等写入 DB。
 * 规则与系统说明请配置在 **extra.taskTemplate.prompt.unifiedTemplate**（不再使用 rules_i18n 列）。
 */
import { useState, useEffect, useCallback } from 'react';
import {
  listPromptConfig,
  getPromptConfigByKey,
  upsertPromptConfig,
  deletePromptConfig,
  type PromptConfigBody,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { pageCardTitle } from '../components/PageHint';
import { App, Button, Table, Modal, Select, Input, Switch, Tabs } from 'antd';

const SCOPE_OPTIONS = [
  { value: 'writing', label: '写作 (writing)' },
  { value: 'graph', label: '图文 (graph)' },
  { value: 'audio', label: '音频 (audio)' },
  { value: 'music', label: '音乐 (music)' },
  { value: 'video', label: '视频 (video)' },
];

const WRITING_TYPES = [
  { value: 'outlines', label: '大纲 outlines' },
  { value: 'articles', label: '文章 articles' },
  { value: 'storyboard-scripts', label: '分镜脚本 storyboard-scripts' },
  { value: 'voice-scripts', label: '口播脚本 voice-scripts' },
  { value: 'lyrics', label: '歌词 lyrics' },
  { value: 'reviews', label: '评论 reviews' },
  { value: 'resumes', label: '简历 resumes' },
  { value: 'media-post', label: '媒体帖 media-post' },
];

const GRAPH_TYPES = [
  { value: 'photograph', label: '摄影 photograph' },
  { value: 'painting', label: '绘画 painting' },
  { value: 'design', label: '设计 design' },
];

/** 无 DB 配置时占位文案（表格与弹窗统一） */
const OUTPUT_FORMAT_PLACEHOLDER = '见编辑弹窗配置';

/**
 * 从行数据取「输出要求」展示文案：优先 output_format_i18n.zh，空则占位；可选截断（表格用）
 */
function getOutputRequirementDisplay(row: PromptConfigRow, truncate?: number): string {
  const raw = (row.output_format_i18n?.zh ?? row.output_format_i18n?.en ?? '').trim();
  const text = raw || OUTPUT_FORMAT_PLACEHOLDER;
  if (truncate != null && text.length > truncate) return text.slice(0, truncate) + '...';
  return text;
}

export interface PromptConfigRow {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  form_options_i18n?: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
  is_active: boolean;
  updated_at?: string;
}

export default function PromptConfig() {
  const { message, modal } = App.useApp();
  const { isLoggedIn, isAdmin } = useAuth();
  const [lists, setLists] = useState<PromptConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  const [currentRow, setCurrentRow] = useState<PromptConfigRow | null>(null);

  // 编辑态表单（规则统一在 extra.taskTemplate.unifiedTemplate）
  const [outputFormatZh, setOutputFormatZh] = useState('');
  const [outputFormatEn, setOutputFormatEn] = useState('');
  const [extraJson, setExtraJson] = useState('{}');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const typeOptions = scopeFilter === 'writing' ? WRITING_TYPES : scopeFilter === 'graph' ? GRAPH_TYPES : [];

  const loadLists = useCallback(async () => {
    const res = await listPromptConfig({
      scope: scopeFilter || undefined,
      type: typeFilter || undefined,
    });
    const raw = res.data as { data?: { items?: PromptConfigRow[]; total?: number }; items?: PromptConfigRow[] } | undefined;
    const items = raw?.data?.items ?? raw?.items;
    if (!res.error && Array.isArray(items)) setLists(items);
    else setLists([]);
  }, [scopeFilter, typeFilter]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    const t = window.setTimeout(() => {
      void loadLists();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isLoggedIn, isAdmin, loadLists]);

  const openDetail = async (row: PromptConfigRow, mode: 'view' | 'edit') => {
    setCurrentRow(row);
    setModalMode(mode);
    setModalOpen(true);
    setOutputFormatZh((row.output_format_i18n as Record<string, string>)?.zh ?? '');
    setOutputFormatEn((row.output_format_i18n as Record<string, string>)?.en ?? '');
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    setExtraJson(JSON.stringify(extra, null, 2));
    setIsActive(row.is_active);

    // 拉取最新 by-key 以与接口实际使用一致
    setLoading(true);
    const res = await getPromptConfigByKey({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype ?? undefined,
      lang: 'zh',
    });
    setLoading(false);
    const data = (res.data as { data?: PromptConfigRow & { output_format?: string } })?.data;
    if (!res.error && data) {
      if (data.output_format !== undefined) setOutputFormatZh(data.output_format);
      // 用 by-key 返回的完整 extra 覆盖列表项（避免列表未带全 extra 时保存误覆盖 DB）
      if (data.extra !== undefined) {
        const extra = (data.extra ?? {}) as Record<string, unknown>;
        setExtraJson(JSON.stringify(extra, null, 2));
        setCurrentRow((prev) => (prev ? { ...prev, extra: data.extra } : prev));
      }
    }
  };

  const handleSave = async () => {
    if (!currentRow) return;
    setSaving(true);
    let extra: Record<string, unknown> = {};
    try {
      extra = JSON.parse(extraJson);
    } catch {
      message.warning('扩展配置 JSON 格式无效，将使用原有值');
      extra = { ...((currentRow.extra ?? {}) as Record<string, unknown>) };
    }
    const body: PromptConfigBody = {
      scope: currentRow.scope,
      type: currentRow.type,
      subtype: currentRow.subtype ?? undefined,
      output_format_i18n: { zh: outputFormatZh, en: outputFormatEn },
      extra,
      is_active: isActive,
    };
    const res = await upsertPromptConfig(body);
    setSaving(false);
    if (res.error) message.error(res.error);
    else {
      message.success('已保存');
      setModalOpen(false);
      loadLists();
    }
  };

  const handleDelete = (row: PromptConfigRow) => {
    modal.confirm({
      title: '确认删除',
      content: `确定删除该提示词配置（${row.scope} / ${row.type}${row.subtype ? ` / ${row.subtype}` : ''}）？删除后该业务将回退到代码内默认配置。`,
      onOk: async () => {
        const res = await deletePromptConfig(row.id);
        if (res.error) message.error(res.error);
        else {
          message.success('已删除');
          loadLists();
        }
      },
    });
  };

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>提示词工程</h2>
        <p>请先使用 Admin 账号登录。</p>
      </div>
    );
  }

  return (
    <div className="page-card admin-prompt-config-page">
      <h2>
        {pageCardTitle('提示词工程（Admin）', {
          title: '配置说明',
          description: (
            <>
              按业务 (scope / type / subtype) 查看与编辑。系统规则与 briefing 请写在{' '}
              <strong>扩展配置 extra → taskTemplate → prompt.unifiedTemplate</strong>；本页「输出格式」仍对应
              <code>output_format_i18n</code>（可与 unified 中「【输出要求】」段落配合使用）。
            </>
          ),
        })}
      </h2>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          placeholder="scope"
          value={scopeFilter || undefined}
          onChange={(v) => { setScopeFilter(v ?? ''); setTypeFilter(''); }}
          style={{ width: 160 }}
          allowClear
        >
          {SCOPE_OPTIONS.map((o) => (
            <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
          ))}
        </Select>
        <Select
          placeholder="type"
          value={typeFilter || undefined}
          onChange={(v) => setTypeFilter(v ?? '')}
          style={{ width: 200 }}
          allowClear
        >
          {typeOptions.map((o) => (
            <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
          ))}
        </Select>
        <Button type="primary" onClick={loadLists} loading={loading}>查询</Button>
      </div>

      <div className="admin-prompt-config-table-wrap">
        <div className="admin-prompt-config-table-inner">
      <Table<PromptConfigRow>
        size="small"
        dataSource={lists}
        rowKey="id"
        loading={loading}
        columns={[
          { title: 'scope', dataIndex: 'scope', width: 90 },
          { title: 'type', dataIndex: 'type', width: 140 },
          { title: 'subtype', dataIndex: 'subtype', width: 120, render: (v: string | null) => v ?? '-' },
          {
            title: '输出要求',
            key: 'outputHint',
            width: 220,
            ellipsis: true,
            render: (_: unknown, r: PromptConfigRow) => getOutputRequirementDisplay(r, 80),
          },
          { title: '启用', dataIndex: 'is_active', width: 60, render: (v: boolean) => (v ? '是' : '否') },
          { title: '更新时间', dataIndex: 'updated_at', width: 180, render: (v: string) => (v ? new Date(v).toLocaleString() : '-') },
          {
            title: '操作',
            width: 200,
            render: (_, r) => (
              <>
                <Button type="link" size="small" onClick={() => openDetail(r, 'view')}>查看</Button>
                <Button type="link" size="small" onClick={() => openDetail(r, 'edit')}>编辑</Button>
                <Button type="link" size="small" danger onClick={() => handleDelete(r)}>删除</Button>
              </>
            ),
          },
        ]}
        scroll={{ x: 900, y: 'calc(100vh - 300px)' }}
        pagination={{ pageSize: 10 }}
      />
        </div>
      </div>

      <Modal
        title={currentRow ? `提示词配置：${currentRow.scope} / ${currentRow.type}${currentRow.subtype ? ` / ${currentRow.subtype}` : ''}` : '详情'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={720}
        footer={
          modalMode === 'edit'
            ? [
                <Button key="cancel" onClick={() => setModalOpen(false)}>取消</Button>,
                <Button key="save" type="primary" onClick={handleSave} loading={saving}>保存</Button>,
              ]
            : [<Button key="close" onClick={() => setModalOpen(false)}>关闭</Button>]
        }
      >
        {currentRow && (
          <>
            <p style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, fontSize: 13 }}>
              <strong>本业务接口输出要求：</strong>{getOutputRequirementDisplay(currentRow)}
            </p>
            <Tabs
            items={[
              {
                key: 'zh',
                label: '输出格式（中文）',
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label>输出格式说明（中文）</label>
                      <Input.TextArea
                        value={outputFormatZh}
                        onChange={(e) => setOutputFormatZh(e.target.value)}
                        readOnly={modalMode === 'view'}
                        rows={6}
                        placeholder="对模型输出格式的要求"
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'en',
                label: 'Output format (EN)',
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label>Output format (EN)</label>
                      <Input.TextArea
                        value={outputFormatEn}
                        onChange={(e) => setOutputFormatEn(e.target.value)}
                        readOnly={modalMode === 'view'}
                        rows={6}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'extra',
                label: '扩展配置',
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label>扩展配置（extra，JSON）</label>
                      <Input.TextArea
                        value={extraJson}
                        onChange={(e) => setExtraJson(e.target.value)}
                        readOnly={modalMode === 'view'}
                        rows={8}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
          />
          </>
        )}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch checked={isActive} onChange={setIsActive} disabled={modalMode === 'view'} />
          <span>启用该配置（关闭后接口将回退代码默认）</span>
        </div>
      </Modal>
    </div>
  );
}
