
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
} from 'antd';
import type {
  JsonSchema,
  SchemaFieldRow,
  TaskTemplateDraft,
} from './AdminBusiness.types';
import {
  fieldRowsToSchema,
  prettyJson,
  safeJsonParse,
  SYSTEM_SCHEMA_FIELD_SET,
} from './AdminBusiness.utils';

export interface AdminBusinessSchemaTabProps {
  draft: TaskTemplateDraft | null;
  schemaMode: 'guided' | 'json';
  schemaRows: SchemaFieldRow[];
  schemaJson: string;
  promptVarSearch: string;
  unifiedTemplateMarkup: string;
  promptMarkupGetterRef: React.MutableRefObject<((format: 'pure_string' | 'string' | 'markdown' | 'html') => string) | null>;
  missingSchemaVars: string[];
  onSchemaModeChange: (v: 'guided' | 'json') => void;
  onSchemaRowsChange: (v: SchemaFieldRow[] | ((prev: SchemaFieldRow[]) => SchemaFieldRow[])) => void;
  onSchemaJsonChange: (json: string) => void;
  onPromptVarSearchChange: (v: string) => void;
  onSyncToJson: () => void;
  onUnifiedTemplateMarkupChange: (v: string) => void;
  onAddMissingVarsToSchema: () => void;
}

export function AdminBusinessSchemaTab({
  draft,
  schemaMode,
  schemaRows,
  schemaJson,
  onSchemaModeChange,
  onSchemaRowsChange,
  onSchemaJsonChange,
  onSyncToJson,
}: AdminBusinessSchemaTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted">编辑模式：</span>
        <Select
          value={schemaMode}
          onChange={onSchemaModeChange}
          style={{ width: 180 }}
          options={[
            { value: 'guided', label: '可视化（字段列表）' },
            { value: 'json', label: '高级（JSON）' },
          ]}
        />
        <Button
          onClick={() => {
            const parsed = safeJsonParse<JsonSchema>(schemaJson);
            const nextSchema =
              schemaMode === 'guided'
                ? fieldRowsToSchema(draft?.formSchema ?? { type: 'object', properties: {}, required: [] }, schemaRows)
                : parsed.ok
                ? parsed.value
                : (draft?.formSchema ?? { type: 'object', properties: {}, required: [] });
            onSchemaJsonChange(prettyJson(nextSchema));
          }}
        >
          同步到 JSON
        </Button>
        {schemaMode === 'guided' && (
          <Button
            type="primary"
            onClick={() => {
              onSchemaRowsChange((prev) => [
                ...prev,
                { key: `field_${Date.now()}`, name: '', type: 'string', required: false, userVisible: true, enumText: '', enumLabelsText: '', defaultText: '' },
              ]);
            }}
          >
            新增字段
          </Button>
        )}
      </div>

      {schemaMode === 'guided' ? (
        <div>
          <div style={{ marginTop: 8, overflow: 'hidden' }}>
            <div
              style={{
                maxHeight: 'calc(100vh - 240px)',
                overflow: 'auto',
                paddingRight: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {schemaRows.length === 0 ? (
                <div style={{ padding: 18 }}>
                  <Empty description="暂无字段，点击「新增字段」添加。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              ) : null}
              {schemaRows.map((r, idx) => {
                const isSystem = SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim());
                const type = String(r.type || 'string');
                const typeOptions = [
                  { value: 'text', label: 'text（多行）' },
                  { value: 'string', label: 'string（单行）' },
                  { value: 'number', label: 'number（数字）' },
                  { value: 'selection', label: 'selection（下拉）' },
                  { value: 'referenceImages', label: 'referenceImages（参考图多张）' },
                ];
                const updateRow = (patch: Partial<SchemaFieldRow>) =>
                  onSchemaRowsChange(schemaRows.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

                const defaultInput =
                  type === 'number' ? (
                    <InputNumber
                      size="small"
                      value={r.defaultText.trim() === '' ? undefined : Number(r.defaultText)}
                      onChange={(v) => updateRow({ defaultText: v == null ? '' : String(v) })}
                      style={{ width: '100%' }}
                    />
                  ) : type === 'text' ? (
                    <Input.TextArea
                      value={r.defaultText}
                      onChange={(e) => updateRow({ defaultText: e.target.value })}
                      rows={1}
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      style={{ width: '100%', minWidth: 0, resize: 'none' }}
                    />
                  ) : (
                    <Input
                      size="small"
                      value={r.defaultText}
                      onChange={(e) => updateRow({ defaultText: e.target.value })}
                    />
                  );

                return (
                  <div
                    key={r.key}
                    style={{
                      border: '1px solid rgba(148,163,184,0.25)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(15, 23, 42, 0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Tag
                          color={
                            type === 'number'
                              ? 'green'
                              : type === 'selection'
                                ? 'purple'
                                : type === 'text'
                                  ? 'geekblue'
                                  : type === 'referenceImages'
                                    ? 'magenta'
                                    : 'blue'
                          }
                        >
                          {type}
                        </Tag>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {r.title?.trim() ? r.title : r.name?.trim() ? r.name : `字段 #${idx + 1}`}
                        </span>
                        {isSystem ? <Tag color="gold">系统</Tag> : null}
                      </div>
                      <Button
                        danger
                        size="small"
                        disabled={isSystem}
                        onClick={() => onSchemaRowsChange(schemaRows.filter((_, i) => i !== idx))}
                      >
                        删除
                      </Button>
                    </div>

                    <div style={{ height: 10 }} />

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                        gap: 10,
                        alignItems: 'start',
                      }}
                    >
                      <div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          字段名
                        </div>
                        <Input
                          size="small"
                          value={r.name}
                          disabled={isSystem}
                          placeholder="例如：tone"
                          onChange={(e) => updateRow({ name: e.target.value })}
                        />
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          类型
                        </div>
                        <Select
                          size="small"
                          value={type}
                          disabled={isSystem}
                          onChange={(v) => updateRow({ type: v })}
                          options={typeOptions}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          标题（label）
                        </div>
                        <Input
                          size="small"
                          value={r.title}
                          disabled={isSystem}
                          placeholder="例如：整体语调"
                          onChange={(e) => updateRow({ title: e.target.value })}
                        />
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                      <div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          描述（help）
                        </div>
                        <Input
                          size="small"
                          value={r.description}
                          disabled={isSystem}
                          placeholder="用于提示用户如何填写"
                          onChange={(e) => updateRow({ description: e.target.value })}
                        />
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          默认值
                        </div>
                        <div style={{ minWidth: 0 }}>{defaultInput}</div>
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          必填
                        </span>
                        <Switch
                          size="small"
                          checked={isSystem ? true : !!r.required}
                          disabled={isSystem}
                          onChange={(v) => updateRow({ required: v })}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          对用户可见
                        </span>
                        <Switch
                          size="small"
                          checked={isSystem ? false : !!r.userVisible}
                          disabled={isSystem}
                          onChange={(v) => updateRow({ userVisible: v })}
                        />
                      </div>
                    </div>

                    {type === 'selection' ? (
                      <>
                        <div style={{ height: 10 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                          <div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                              枚举（每行一个值）
                            </div>
                            <Input.TextArea
                              value={r.enumText}
                              disabled={isSystem}
                              onChange={(e) => updateRow({ enumText: e.target.value })}
                              rows={2}
                              autoSize={{ minRows: 2, maxRows: 8 }}
                              style={{ width: '100%', minWidth: 0, resize: 'none' }}
                            />
                          </div>
                          <div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                              枚举展示名（与枚举行数一致）
                            </div>
                            <Input.TextArea
                              value={r.enumLabelsText}
                              disabled={isSystem}
                              placeholder="如：文章、口播稿"
                              onChange={(e) => updateRow({ enumLabelsText: e.target.value })}
                              rows={2}
                              autoSize={{ minRows: 2, maxRows: 8 }}
                              style={{ width: '100%', minWidth: 0, resize: 'none' }}
                            />
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Alert
            type="info"
            showIcon
            message="提示：系统字段不会进入 Schema"
            description="`uid` 为系统追踪字段（前端/系统自动生成），此处不会显示/保存到 Schema。"
          />
          <Input.TextArea
            value={schemaJson}
            onChange={(e) => onSchemaJsonChange(e.target.value)}
            rows={18}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
        </div>
      )}
    </div>
  );
}
