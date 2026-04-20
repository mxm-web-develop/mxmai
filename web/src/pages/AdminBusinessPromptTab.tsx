import React from 'react';
import {
  Alert,
  App,
  Button,
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
  promptVarSearch: string;
  unifiedTemplateMarkup: string;
  promptMarkupGetterRef: React.MutableRefObject<((format: 'pure_string' | 'string' | 'markdown' | 'html') => string) | null>;
  missingSchemaVars: string[];
  onPromptVarSearchChange: (v: string) => void;
  onUnifiedTemplateMarkupChange: (v: string) => void;
  onAddMissingVarsToSchema: () => void;
}

export function AdminBusinessPromptTab({
  draft,
  schemaMode,
  schemaRows,
  schemaJson,
  promptVarSearch,
  unifiedTemplateMarkup,
  promptMarkupGetterRef,
  missingSchemaVars,
  onPromptVarSearchChange,
  onUnifiedTemplateMarkupChange,
  onAddMissingVarsToSchema,
}: AdminBusinessPromptTabProps) {
  const { message } = App.useApp();
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
            styles={{
              templateField: {
                backgroundColor: 'rgba(251, 191, 36, 0.14)',
                borderColor: 'rgba(251, 191, 36, 0.55)',
                textColor: '#fde68a',
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
