import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import type { BusinessDisplayConfig, PromptConfigRow, Scope, TaskTemplateDraft } from './AdminBusiness.types';

export interface AdminBusinessConfigTabProps {
  selected: PromptConfigRow | null;
  displayConfig: BusinessDisplayConfig;
  draft: TaskTemplateDraft | null;
  sensitiveLists: Array<{ id: string; name: string; description?: string | null; is_active: boolean }>;
  sensitiveSelectedListIds: string[];
  sensitiveLoading: boolean;
  sensitiveHint: string | null;
  scopeFilter: Scope;
  onDisplayConfigChange: (d: BusinessDisplayConfig) => void;
  onDraftChange: (v: TaskTemplateDraft | null | ((prev: TaskTemplateDraft | null) => TaskTemplateDraft | null)) => void;
  onSensitiveListIdsChange: (ids: string[]) => void;
  onSaveSensitiveBinding: () => void;
}

export function AdminBusinessConfigTab({
  selected,
  displayConfig,
  draft,
  sensitiveLists,
  sensitiveSelectedListIds,
  sensitiveLoading,
  sensitiveHint,
  scopeFilter,
  onDisplayConfigChange,
  onDraftChange,
  onSensitiveListIdsChange,
  onSaveSensitiveBinding,
}: AdminBusinessConfigTabProps) {
  return (
    <Form layout="vertical">
      <Alert
        type="info"
        showIcon
        message="基础配置"
        description="用于配置：业务显示名（taskKey/subtype）、敏感词库挂载、以及存储等基础能力。"
      />

      <Divider style={{ margin: '10px 0' }} />

      <div style={{ fontWeight: 700 }}>业务显示名（给用户看的 label）</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item label="taskKey 显示名">
          <Input
            value={displayConfig.taskLabel ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                taskLabel: e.target.value,
              })
            }
            placeholder={`例如：${selected?.type ?? ''}`}
          />
        </Form.Item>
        <Form.Item label="subtype 显示名（可选）">
          <Input
            value={displayConfig.subtypeLabel ?? ''}
            onChange={(e) =>
              onDisplayConfigChange({
                ...displayConfig,
                subtypeLabel: e.target.value,
              })
            }
            placeholder={selected?.subtype ?? '（无 subtype）'}
            disabled={!selected?.subtype}
          />
        </Form.Item>
      </div>

      <Divider style={{ margin: '10px 0' }} />

      <div style={{ fontWeight: 700 }}>敏感词库挂载（该业务线上生效）</div>
      {sensitiveHint ? (
        <Alert type="warning" showIcon message="敏感词库未初始化或不可用" description={sensitiveHint} />
      ) : null}
      <Form.Item label="选择敏感词库（可多选）">
        <Select
          mode="multiple"
          allowClear
          placeholder={sensitiveLists.length ? '请选择敏感词库' : '暂无敏感词库（可先去敏感词页创建）'}
          loading={sensitiveLoading}
          value={sensitiveSelectedListIds}
          onChange={onSensitiveListIdsChange}
          options={sensitiveLists.map((l) => ({
            value: l.id,
            label: l.description ? `${l.name}（${l.description}）` : l.name,
          }))}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Space>
        <Button
          type="primary"
          loading={sensitiveLoading}
          disabled={!selected}
          onClick={onSaveSensitiveBinding}
        >
          保存敏感词挂载
        </Button>
        <Typography.Text type="secondary">
          slot: {selected?.scope}/{selected?.type}/{selected?.subtype ?? '*'}
        </Typography.Text>
      </Space>

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
                  scope: scopeFilter,
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
        <>
          <Form.Item label="storage.extension">
            <Input
              value={draft.storage.extension}
              onChange={(e) =>
                onDraftChange((prev) => (prev && prev.storage ? { ...prev, storage: { ...prev.storage, extension: e.target.value } } : prev))
              }
            />
          </Form.Item>
          <Form.Item label="storage.bucket">
            <Input value={draft.storage.bucket ?? ''} disabled readOnly />
          </Form.Item>
          <Form.Item label="storage.pathTemplate">
            <Input
              value={draft.storage.pathTemplate ?? ''}
              disabled
              readOnly
              placeholder="outlines/${userId}/${date}/"
            />
          </Form.Item>
          <Form.Item label="storage.filenameTemplate">
            <Input
              value={draft.storage.filenameTemplate ?? ''}
              disabled
              readOnly
              placeholder="outline_${taskId}_${uuid}.json"
            />
          </Form.Item>
          <Form.Item label="storage.mime">
            <Input value={draft.storage.mime ?? ''} disabled readOnly />
          </Form.Item>
        </>
      )}
    </Form>
  );
}
