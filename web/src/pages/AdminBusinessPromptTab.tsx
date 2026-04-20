import React from 'react';
import {
  Alert,
  App,
  Button,
  Divider,
  Form,
  Input,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { PromptTempDesigner } from '@mxmweb/rtext';
import type {
  JsonSchema,
  SchemaFieldRow,
  Scope,
  TaskTemplateDraft,
} from './AdminBusiness.types';
import {
  fieldRowsToSchema,
  parseTemplateMarkup,
  SYSTEM_SCHEMA_FIELD_SET,
} from './AdminBusiness.utils';

export interface AdminBusinessPromptTabProps {
  draft: TaskTemplateDraft | null;
  schemaMode: 'guided' | 'json';
  schemaRows: SchemaFieldRow[];
  schemaJson: string;
  scopeFilter: Scope;
  promptVarSearch: string;
  unifiedTemplateMarkup: string;
  promptMarkupGetterRef: React.MutableRefObject<((format: 'pure_string' | 'string' | 'markdown' | 'html') => string) | null>;
  missingSchemaVars: string[];
  promptTextTaskKey?: string;
  onPromptVarSearchChange: (v: string) => void;
  onUnifiedTemplateMarkupChange: (v: string) => void;
  onAddMissingVarsToSchema: () => void;
  onPromptTextTaskKeyChange: (v: string) => void;
}

export function AdminBusinessPromptTab({
  draft,
  schemaMode,
  schemaRows,
  schemaJson,
  scopeFilter,
  promptVarSearch,
  unifiedTemplateMarkup,
  promptMarkupGetterRef,
  missingSchemaVars,
  promptTextTaskKey,
  onPromptVarSearchChange,
  onUnifiedTemplateMarkupChange,
  onAddMissingVarsToSchema,
  onPromptTextTaskKeyChange,
}: AdminBusinessPromptTabProps) {
  const { message } = App.useApp();
  // 检测暗色主题
  const [isDarkTheme, setIsDarkTheme] = React.useState(() => {
    return document.documentElement.classList.contains('dark') ||
           document.documentElement.classList.contains('dark-mode');
  });
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(
        document.documentElement.classList.contains('dark') ||
        document.documentElement.classList.contains('dark-mode')
      );
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const effectiveSchema: JsonSchema | undefined =
    schemaMode === 'guided' && draft
      ? fieldRowsToSchema(draft.formSchema, schemaRows)
      : draft?.formSchema;

  const requiredSet = new Set<string>((effectiveSchema?.required ?? []).map((x) => String(x)));

  const schemaProps = (effectiveSchema?.properties ?? {}) as Record<string, unknown>;

  const templateVarsUsed = React.useMemo(() => {
    if (!draft) return [];
    const parsed = parseTemplateMarkup(unifiedTemplateMarkup);
    return parsed.vars.map((v) => v.name);
  }, [draft, unifiedTemplateMarkup]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>提示词配置</div>

      {/* graph 业务专属：关联 text 业务解析/转换 prompt */}
      {scopeFilter === 'graph' && (
        <Alert
          type="info"
          showIcon
          message="Prompt 格式解析"
          description="指定一个 scope=text 的业务（如 text-nano-banana-format）来解析用户 prompt + schema，输出适合生图模型的 prompt。"
        />
      )}
      {scopeFilter === 'graph' && (
        <Form.Item
          label="Text Format Task Key"
          tooltip="指定用于解析/转换 graph prompt 的 text 业务 taskKey，例如 text-nano-banana-format"
          style={{ marginTop: 8, marginBottom: 0 }}
        >
          <Input
            value={promptTextTaskKey ?? ''}
            onChange={(e) => onPromptTextTaskKeyChange(e.target.value.trim())}
            placeholder="例如：text-nano-banana-format"
          />
        </Form.Item>
      )}

      <div style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px dashed rgba(148,163,184,0.4)' }}>
        <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>可用变量（来自 Schema）</span>
          <Input
            allowClear
            size="small"
            placeholder="搜索变量名或标题…"
            value={promptVarSearch}
            onChange={(e) => onPromptVarSearchChange(e.target.value)}
            style={{ width: 180 }}
          />
        </div>
        <Space size={[6, 6]} wrap>
          {Object.entries(schemaProps)
            .filter(([name, defRaw]) => {
              if (!promptVarSearch.trim()) return true;
              const def =
                defRaw && typeof defRaw === 'object'
                  ? (defRaw as Record<string, unknown>)
                  : {};
              const title = def.title != null ? String(def.title) : name;
              const q = promptVarSearch.trim().toLowerCase();
              return (
                name.toLowerCase().includes(q) ||
                String(title).toLowerCase().includes(q)
              );
            })
            .map(([name, defRaw]) => {
              const def =
                defRaw && typeof defRaw === 'object'
                  ? (defRaw as Record<string, unknown>)
                  : {};
              const title = def.title != null ? String(def.title) : name;
              const isRequired = requiredSet.has(name);
              const isSystem = SYSTEM_SCHEMA_FIELD_SET.has(name);
              const label = isSystem ? `${name}（系统）` : name;
              const type = def.type != null ? String(def.type) : 'string';
              const defaultValue =
                def.default !== undefined && def.default !== null
                  ? String(def.default)
                  : '';
              const snippetAttrs = [
                `name="${name}"`,
                `type="${type}"`,
                `label="${title}"`,
                `required="${isRequired ? 'true' : 'false'}"`,
              ];
              if (defaultValue) {
                snippetAttrs.push(`defaultValue="${defaultValue}"`);
              }
              const snippet = `<template ${snippetAttrs.join(' ')}>${name}</template>`;
              return (
                <Space key={name} size={4} align="center">
                  <Tag color={isSystem ? 'gold' : 'blue'}>{label}</Tag>
                  <Tooltip title="复制 &lt;template&gt; 片段">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      style={{ padding: '0 4px', color: 'inherit', opacity: 0.7 }}
                      onClick={() => {
                        if (navigator.clipboard?.writeText) {
                          void navigator.clipboard.writeText(snippet);
                          message.success('已复制，请在光标处粘贴');
                        } else {
                          message.info('请手动复制：' + snippet);
                        }
                      }}
                    />
                  </Tooltip>
                </Space>
              );
            })}
        </Space>
      </div>
      {missingSchemaVars.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="Prompt 模板变量未在 Schema 定义"
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="mono">{missingSchemaVars.map((v) => `\${${v}}`).join('  ')}</div>
              <Space wrap>
                <Button
                  size="small"
                  onClick={onAddMissingVarsToSchema}
                >
                  一键补到 Schema
                </Button>
              </Space>
            </div>
          }
        />
      ) : null}

      <div style={{ marginTop: 12 }}>
        <div
          className="rtext-editor-fix"
          style={{
            marginTop: 12,
            border: '1px solid rgba(148, 163, 184, 0.22)',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <PromptTempDesigner
            data={unifiedTemplateMarkup}
            onChange={onUnifiedTemplateMarkupChange}
            onGetData={(getData) => {
              promptMarkupGetterRef.current = getData;
            }}
            // 亮色主题：蓝色；暗色主题：暖橙色
            styles={{
              templateField: {
                backgroundColor: isDarkTheme
                  ? 'rgba(251, 191, 36, 0.14)'
                  : 'rgba(59, 130, 246, 0.15)',
                borderColor: isDarkTheme
                  ? 'rgba(251, 191, 36, 0.55)'
                  : 'rgba(59, 130, 246, 0.4)',
                textColor: isDarkTheme ? '#fde68a' : '#3b82f6',
                minWidth: '64px',
                maxWidth: '520px',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
