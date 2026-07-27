import {
  Divider,
  Form,
  Input,
  Select,
  Switch,
  Typography,
} from 'antd';
import type { BusinessDisplayConfig, PromptConfigRow, Scope, TaskTemplateDraft } from './AdminBusiness.types';
import { createWritingStorageBlock } from './AdminBusiness.utils';
import { PageHint, PageHintsBar } from '../components/PageHint';

export interface AdminBusinessConfigTabProps {
  selected: PromptConfigRow | null;
  displayConfig: BusinessDisplayConfig;
  draft: TaskTemplateDraft | null;
  extraDraft: Record<string, unknown>;
  scopeFilter: Scope;
  onDisplayConfigChange: (d: BusinessDisplayConfig) => void;
  onDraftChange: (v: TaskTemplateDraft | null | ((prev: TaskTemplateDraft | null) => TaskTemplateDraft | null)) => void;
  onExtraDraftChange: (v: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => void;
}

export function AdminBusinessConfigTab({
  selected,
  displayConfig,
  draft,
  extraDraft,
  scopeFilter,
  onDisplayConfigChange,
  onDraftChange,
  onExtraDraftChange,
}: AdminBusinessConfigTabProps) {
  const businessScope = (selected?.scope ?? scopeFilter) as Scope;
  const isWriting = businessScope === 'writing';

  return (
    <Form layout="vertical">
      <PageHintsBar>
        <PageHint
          title="基础配置"
          description="用于配置业务显示名、业务描述、Agent 路由规则，以及 Writing 业务的文件保存等基础能力。"
        />
      </PageHintsBar>

      <Divider style={{ margin: '10px 0' }} />

      <div style={{ fontWeight: 700 }}>业务显示名（给用户看的 label）</div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        规范：taskLabel = 分类，subtypeLabel = 具体业务；不用括号、不写 scope/type/subtype 路径。详见 skill mxmai_business_naming。
      </Typography.Text>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item label="taskKey 显示名（简体中文）">
          <Input
            value={displayConfig.taskLabel ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                taskLabel: e.target.value,
                taskLabelI18n: {
                  ...displayConfig.taskLabelI18n,
                  zh: e.target.value,
                },
              })
            }
            placeholder={`例如：${selected?.type ?? ''}`}
          />
        </Form.Item>
        <Form.Item label="subtype 显示名（简体中文，可选）">
          <Input
            value={displayConfig.subtypeLabel ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                subtypeLabel: e.target.value,
                subtypeLabelI18n: {
                  ...displayConfig.subtypeLabelI18n,
                  zh: e.target.value,
                },
              })
            }
            placeholder={selected?.subtype ?? '（无 subtype）'}
            disabled={!selected?.subtype}
          />
        </Form.Item>
        <Form.Item label="taskKey display name (EN)">
          <Input
            value={displayConfig.taskLabelI18n?.en ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                taskLabelI18n: {
                  ...displayConfig.taskLabelI18n,
                  zh: displayConfig.taskLabelI18n?.zh ?? displayConfig.taskLabel,
                  en: e.target.value,
                },
              })
            }
            placeholder="e.g. Album"
          />
        </Form.Item>
        <Form.Item label="subtype display name (EN)">
          <Input
            value={displayConfig.subtypeLabelI18n?.en ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                subtypeLabelI18n: {
                  ...displayConfig.subtypeLabelI18n,
                  zh: displayConfig.subtypeLabelI18n?.zh ?? displayConfig.subtypeLabel,
                  en: e.target.value,
                },
              })
            }
            placeholder="e.g. Content illustration"
            disabled={!selected?.subtype}
          />
        </Form.Item>
        <Form.Item label="taskKey 顯示名（繁體）">
          <Input
            value={displayConfig.taskLabelI18n?.['zh-TW'] ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                taskLabelI18n: {
                  ...displayConfig.taskLabelI18n,
                  zh: displayConfig.taskLabelI18n?.zh ?? displayConfig.taskLabel,
                  'zh-TW': e.target.value,
                },
              })
            }
            placeholder="例如：圖集"
          />
        </Form.Item>
        <Form.Item label="subtype 顯示名（繁體）">
          <Input
            value={displayConfig.subtypeLabelI18n?.['zh-TW'] ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                subtypeLabelI18n: {
                  ...displayConfig.subtypeLabelI18n,
                  zh: displayConfig.subtypeLabelI18n?.zh ?? displayConfig.subtypeLabel,
                  'zh-TW': e.target.value,
                },
              })
            }
            placeholder="例如：內容配圖"
            disabled={!selected?.subtype}
          />
        </Form.Item>
        <Form.Item label="taskKey 表示名（日本語）">
          <Input
            value={displayConfig.taskLabelI18n?.ja ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                taskLabelI18n: {
                  ...displayConfig.taskLabelI18n,
                  zh: displayConfig.taskLabelI18n?.zh ?? displayConfig.taskLabel,
                  ja: e.target.value,
                },
              })
            }
            placeholder="例：アルバム"
          />
        </Form.Item>
        <Form.Item label="subtype 表示名（日本語）">
          <Input
            value={displayConfig.subtypeLabelI18n?.ja ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                subtypeLabelI18n: {
                  ...displayConfig.subtypeLabelI18n,
                  zh: displayConfig.subtypeLabelI18n?.zh ?? displayConfig.subtypeLabel,
                  ja: e.target.value,
                },
              })
            }
            placeholder="例：コンテンツイラスト"
            disabled={!selected?.subtype}
          />
        </Form.Item>
      </div>

      <Divider style={{ margin: '10px 0' }} />

      <div style={{ fontWeight: 700 }}>业务描述（创建任务交互卡副文案）</div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        简体写入 description；其他语言写入 descriptionI18n。用户语言切换时按回退链展示。
      </Typography.Text>
      <Form.Item label="业务描述（简体中文）">
        <Input.TextArea
          value={displayConfig.description ?? ''}
          onChange={(e) =>
            onDisplayConfigChange({
              ...displayConfig,
              description: e.target.value,
              descriptionI18n: {
                ...displayConfig.descriptionI18n,
                zh: e.target.value,
              },
            })
          }
          placeholder="例如：按行业方向检索热点，引导填写日期与话题，生成结构化行业日报 Markdown。"
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </Form.Item>
      <Form.Item label="Business description (EN)">
        <Input.TextArea
          value={displayConfig.descriptionI18n?.en ?? ''}
          onChange={(e) =>
            onDisplayConfigChange({
              ...displayConfig,
              descriptionI18n: {
                ...displayConfig.descriptionI18n,
                zh: displayConfig.descriptionI18n?.zh ?? displayConfig.description,
                en: e.target.value,
              },
            })
          }
          placeholder="e.g. Trend search by industry, then a structured Markdown industry daily."
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </Form.Item>
      <Form.Item label="業務描述（繁體）">
        <Input.TextArea
          value={displayConfig.descriptionI18n?.['zh-TW'] ?? ''}
          onChange={(e) =>
            onDisplayConfigChange({
              ...displayConfig,
              descriptionI18n: {
                ...displayConfig.descriptionI18n,
                zh: displayConfig.descriptionI18n?.zh ?? displayConfig.description,
                'zh-TW': e.target.value,
              },
            })
          }
          placeholder="例如：按行業方向檢索熱點，引導填寫日期與話題，生成結構化行業日報 Markdown。"
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </Form.Item>
      <Form.Item label="業務説明（日本語）">
        <Input.TextArea
          value={displayConfig.descriptionI18n?.ja ?? ''}
          onChange={(e) =>
            onDisplayConfigChange({
              ...displayConfig,
              descriptionI18n: {
                ...displayConfig.descriptionI18n,
                zh: displayConfig.descriptionI18n?.zh ?? displayConfig.description,
                ja: e.target.value,
              },
            })
          }
          placeholder="例：業界別にトレンドを検索し、構造化された業界日報 Markdown を生成します。"
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </Form.Item>

      <Divider style={{ margin: '10px 0' }} />

      <div style={{ fontWeight: 700 }}>Agent 路由规则</div>
      <Form.Item
        label="Agent 规则描述"
        tooltip="用于关键词未命中时的 LLM 兜底匹配"
      >
        <Input.TextArea
          value={(draft?.extra?.agent_rule as string) ?? ''}
          onChange={(e) =>
            onDraftChange((prev) => {
              if (!prev) return prev;
              const nextRule = e.target.value.trim();
              const prevExtra = (prev.extra ?? {}) as Record<string, unknown>;
              return {
                ...prev,
                extra: {
                  ...prevExtra,
                  agent_rule: nextRule || undefined,
                },
              };
            })
          }
          placeholder="描述什么样的用户表达应触发该业务..."
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Form.Item>
      <Form.Item
        label="Agent 关键词"
        tooltip="用于关键词优先匹配，优先于 LLM 规则匹配"
      >
        <Select
          mode="tags"
          placeholder="输入关键词后回车确认"
          value={Array.isArray(draft?.extra?.agent_keywords) ? draft.extra.agent_keywords : []}
          onChange={(nextKeywords) =>
            onDraftChange((prev) => {
              if (!prev) return prev;
              const normalized = (nextKeywords as string[])
                .map((k) => k.trim())
                .filter((k) => k.length > 0);
              const deduplicated = [...new Set(normalized)];
              const prevExtra = (prev.extra ?? {}) as Record<string, unknown>;
              return {
                ...prev,
                extra: {
                  ...prevExtra,
                  agent_keywords: deduplicated.length > 0 ? deduplicated : undefined,
                },
              };
            })
          }
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Divider style={{ margin: '10px 0' }} />

      <Divider style={{ margin: '10px 0' }} />

      {businessScope === 'video' && (
        <>
          <div style={{ fontWeight: 700 }}>视频编排</div>
          <Form.Item
            label="视频编排任务 (pipelineOrchestrator)"
            tooltip="开启后该视频业务走「分镜 JSON → 人工审核 → render」编排路径，不调用外部视频模型生成 prompt，适用于口播剪辑等自建管线业务"
          >
            <Switch
              checked={extraDraft?.pipelineOrchestrator === true}
              onChange={(enabled) =>
                onExtraDraftChange((prev) => ({
                  ...prev,
                  pipelineOrchestrator: enabled || undefined,
                }))
              }
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            开启后「模型配置」不再展示 internal 编排占位，改为选择 AI 视频块默认调用的 generator 子业务。
          </Typography.Text>
          <Divider style={{ margin: '10px 0' }} />
        </>
      )}

      {isWriting ? (
        <>
          <div style={{ fontWeight: 700 }}>文件保存</div>
          <Form.Item label="启用对象存储 (storage)" tooltip="默认开启；关闭后正文仅写入任务 metadata，不上传 MinIO">
            <Switch
              checked={!!draft?.storage}
              onChange={(enabled) =>
                onDraftChange((prev) => {
                  if (!prev) return prev;
                  if (!enabled) return { ...prev, storage: undefined };
                  return {
                    ...prev,
                    storage: createWritingStorageBlock('markdown', businessScope),
                  };
                })
              }
            />
          </Form.Item>
          {draft?.storage && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              落盘格式固定为 Markdown（.md）；用户下载 PDF 由 Markdown 即时转换，不再配置 txt/csv 等。
            </Typography.Text>
          )}
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            保存全部时，将同步写入 formSchema 隐藏字段 storage_form=markdown / storeToMinio。
          </Typography.Text>
        </>
      ) : (
        <>
          <Form.Item label="storage（可选）">
            <Switch
              checked={!!draft?.storage}
              onChange={(v) =>
                onDraftChange((prev) => {
                  if (!prev) return prev;
                  if (!v) return { ...prev, storage: undefined };
                  return {
                    ...prev,
                    storage: {
                      scope: businessScope,
                      extension: 'json',
                      bucket: '',
                      pathTemplate: '',
                      filenameTemplate: '',
                      mime: '',
                    },
                  };
                })
              }
            />
          </Form.Item>
          {draft?.storage && (
            <Form.Item label="storage.extension">
              <Input
                value={draft.storage.extension}
                onChange={(e) =>
                  onDraftChange((prev) =>
                    prev && prev.storage
                      ? { ...prev, storage: { ...prev.storage, extension: e.target.value } }
                      : prev
                  )
                }
              />
            </Form.Item>
          )}
        </>
      )}
    </Form>
  );
}
