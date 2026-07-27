import React, { useEffect, useMemo, useState } from 'react';
import { Collapse, Input, Typography } from 'antd';
import { PromptTempDesigner } from '@mxmweb/rtext';
import type { JsonSchema, SchemaFieldRow, Scope, TaskTemplateDraft } from './AdminBusiness.types';
import {
  buildContractSkeletonPreview,
  fieldRowsToSchema,
  prettyJson,
} from './AdminBusiness.utils';
import { PageHint, PageHintsBar } from '../components/PageHint';

type GroupOutput = {
  itemsFrom?: string;
  concurrency?: number;
  maxItems?: number;
  commonGroundFrom?: string;
  itemBasicMapping?: Record<string, string>;
  itemWebSearch?: Record<string, unknown> | null;
  itemNestedText?: Record<string, unknown> | null;
  itemManuscript?: {
    field?: string;
    systemPrompt?: string;
    polishTaskKey?: string;
  };
  assemble?: {
    itemsFrom?: string;
    textField?: string;
    titleFrom?: string;
    headingTemplate?: string;
    introTemplate?: string;
  };
};

function readGroupOutput(draft: TaskTemplateDraft | null): GroupOutput | null {
  if (!draft) return null;
  const extra = (draft as Record<string, unknown>).extra as
    | { groupOutput?: GroupOutput }
    | undefined;
  return extra?.groupOutput ?? null;
}

export interface AdminBusinessPromptTabProps {
  draft: TaskTemplateDraft | null;
  schemaMode: 'guided' | 'json';
  schemaRows: SchemaFieldRow[];
  schemaJson: string;
  scopeFilter: Scope;
  promptVarSearch: string;
  unifiedTemplateMarkup: string;
  promptMarkupGetterRef: React.MutableRefObject<
    ((format: 'pure_string' | 'string' | 'markdown' | 'html') => string) | null
  >;
  missingSchemaVars: string[];
  unusedSchemaVars: string[];
  onPromptVarSearchChange: (v: string) => void;
  onUnifiedTemplateMarkupChange: (v: string) => void;
  onAddMissingVarsToSchema: () => void;
}

export function AdminBusinessPromptTab({
  draft,
  schemaMode,
  schemaRows,
  scopeFilter,
  unifiedTemplateMarkup,
  promptMarkupGetterRef,
  onUnifiedTemplateMarkupChange,
}: AdminBusinessPromptTabProps) {
  const effectiveSchema: JsonSchema | undefined = useMemo(() => {
    const base = draft?.contractSchema ?? draft?.formSchema;
    if (schemaMode === 'guided' && draft && base) {
      return fieldRowsToSchema(base, schemaRows);
    }
    return base;
  }, [schemaMode, draft, schemaRows]);

  const skeleton = useMemo(() => buildContractSkeletonPreview(effectiveSchema), [effectiveSchema]);
  const groupOutput = useMemo(() => readGroupOutput(draft), [draft]);
  const isGroupBusiness = scopeFilter !== 'text';
  const manuscriptPrompt = groupOutput?.itemManuscript?.systemPrompt?.trim() ?? '';
  const polishTaskKey = groupOutput?.itemManuscript?.polishTaskKey?.trim() ?? '';
  const groupAuthoring = useMemo(() => {
    if (!groupOutput) return null;
    return {
      itemsFrom: groupOutput.itemsFrom ?? '',
      concurrency: groupOutput.concurrency ?? 0,
      maxItems: groupOutput.maxItems ?? 0,
      commonGroundFrom: groupOutput.commonGroundFrom ?? '',
      itemBasicMapping: groupOutput.itemBasicMapping ?? {},
      itemNestedTextKey: groupOutput.itemNestedText
        ? ((groupOutput.itemNestedText as Record<string, unknown>).nestedTextTaskKey as string) ??
          ''
        : '',
      itemManuscriptField: groupOutput.itemManuscript?.field ?? '',
      assembleTextField: groupOutput.assemble?.textField ?? '',
      assembleHeadingTemplate: groupOutput.assemble?.headingTemplate ?? '',
      assembleIntroTemplate: groupOutput.assemble?.introTemplate ?? '',
    };
  }, [groupOutput]);

  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return (
      document.documentElement.classList.contains('dark') ||
      document.documentElement.classList.contains('dark-mode')
    );
  });
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(
        document.documentElement.classList.contains('dark') ||
          document.documentElement.classList.contains('dark-mode')
      );
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="admin-output-prompt">
      <div className="page-card-title-row" style={{ fontWeight: 700 }}>
        <span className="page-card-title-row__text">Output Prompt</span>
      </div>

      <PageHintsBar>
        <PageHint
          title="仅写角色 / 业务 / 交付规范"
          description="运行时会附带完整回填后的合同 JSON，不做 ${字段} 插值拼装。选用能接受完整合同长度的模型。"
        />
        {isGroupBusiness ? (
          <PageHint
            title="Group 业务：成稿不在此模板"
            description="groupOutput.itemManuscript.systemPrompt 才是真实执笔 Prompt；本模板仅作占位（编译期会被忽略）。"
          />
        ) : null}
      </PageHintsBar>

      <div className="admin-output-prompt__stack">
        <section className="admin-output-prompt__editor" aria-label="Output Prompt 编辑">
          <div className="admin-output-prompt__editor-shell">
            <PromptTempDesigner
              data={unifiedTemplateMarkup}
              onChange={onUnifiedTemplateMarkupChange}
              onGetData={(getData) => {
                promptMarkupGetterRef.current = getData;
              }}
              styles={{
                templateField: {
                  backgroundColor: isDarkTheme
                    ? 'rgba(251, 191, 36, 0.14)'
                    : 'rgba(14, 165, 233, 0.12)',
                  borderColor: isDarkTheme ? 'rgba(251, 191, 36, 0.55)' : 'rgba(14, 165, 233, 0.35)',
                  textColor: isDarkTheme ? '#fde68a' : '#0284c7',
                  minWidth: '64px',
                  maxWidth: '100%',
                },
              }}
            />
          </div>
        </section>

        <Collapse
          ghost
          size="small"
          className="admin-output-prompt__skeleton-collapse"
          items={[
            {
              key: 'skeleton',
              label: (
                <span className="admin-output-prompt__skeleton-label">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    运行时合同骨架
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    output 完整引入回填后合同（含 sources / enrich_search）
                  </Typography.Text>
                </span>
              ),
              children: (
                <Input.TextArea
                  readOnly
                  value={prettyJson(skeleton)}
                  rows={14}
                  className="admin-output-prompt__skeleton-textarea"
                />
              ),
            },
            ...(groupOutput
              ? [
                  {
                    key: 'group-output',
                    label: (
                      <span className="admin-output-prompt__skeleton-label">
                        <Typography.Text strong style={{ fontSize: 13 }}>
                          并发成稿（groupOutput）
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12, marginLeft: 8 }}
                        >
                          itemManuscript.systemPrompt / itemBasicMapping / assemble 模板
                        </Typography.Text>
                      </span>
                    ),
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {groupAuthoring ? (
                          <Input.TextArea
                            readOnly
                            value={prettyJson(groupAuthoring)}
                            rows={6}
                            className="admin-output-prompt__skeleton-textarea"
                          />
                        ) : null}
                        {manuscriptPrompt ? (
                          <Input.TextArea
                            readOnly
                            value={manuscriptPrompt}
                            rows={18}
                            className="admin-output-prompt__skeleton-textarea"
                          />
                        ) : (
                          <Typography.Text type="secondary">
                            未配置 itemManuscript（并发成稿将退化为 groupItemBatch 默认行为）。
                          </Typography.Text>
                        )}
                        {polishTaskKey ? (
                          <Typography.Text type="secondary">
                            后续润色节点：<code>{polishTaskKey}</code>
                          </Typography.Text>
                        ) : null}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
