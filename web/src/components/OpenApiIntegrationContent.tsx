import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse, Descriptions, Input, Space, Table, Tag, Typography } from 'antd';
import type { PublishedApiManifest } from '../api/client';
import { PageHint, PageHintsBar } from './PageHint';

type JsonProp = Record<string, unknown>;

export interface PublishedApiInputDocView {
  examples?: Record<string, unknown>;
  fieldHints?: Record<string, string>;
  referenceImageSlots?: Array<{
    field: string;
    title?: string;
    description?: string;
    maxItems?: number;
  }>;
  notes?: string[];
}

function unwrapManifest(body: unknown): PublishedApiManifest | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === 'object' && 'slug' in (inner as object)) {
    return inner as PublishedApiManifest;
  }
  if ('slug' in o) return o as unknown as PublishedApiManifest;
  return null;
}

export function parseOpenApiManifestResponse(res: {
  data?: unknown;
}): PublishedApiManifest | null {
  return unwrapManifest(res.data);
}

function schemaFieldRows(manifest: PublishedApiManifest) {
  const schema = manifest.inputSchema as {
    properties?: Record<string, JsonProp>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  const requiredSet = new Set((schema.required ?? []).map(String));
  const hints = (manifest.inputDoc as PublishedApiInputDocView)?.fieldHints ?? {};

  return Object.entries(props).map(([key, prop]) => {
    const typeParts: string[] = [];
    if (typeof prop.type === 'string') typeParts.push(prop.type);
    if (typeof prop.format === 'string') typeParts.push(prop.format);
    if (Array.isArray(prop.enum)) typeParts.push(`enum: ${(prop.enum as unknown[]).join(' | ')}`);

    const descParts: string[] = [];
    if (typeof prop.title === 'string' && prop.title.trim()) descParts.push(prop.title.trim());
    if (typeof prop.description === 'string' && prop.description.trim()) descParts.push(prop.description.trim());
    if (hints[key]) descParts.push(hints[key]);

    return {
      key,
      name: key,
      type: typeParts.join(' · ') || '—',
      required: requiredSet.has(key),
      description: descParts.join('；') || '—',
    };
  });
}

function buildExampleRunBody(manifest: PublishedApiManifest): Record<string, unknown> {
  const doc = manifest.inputDoc as PublishedApiInputDocView;
  if (manifest.kind === 'smartflow') {
    const input_data =
      (doc.examples?.input_data as Record<string, unknown> | undefined) ??
      (doc.examples && !('params' in doc.examples) ? (doc.examples as Record<string, unknown>) : undefined);
    return { input_data: input_data ?? {} };
  }
  if (doc.examples?.params && typeof doc.examples.params === 'object') {
    return { params: doc.examples.params };
  }

  const schema = manifest.inputSchema as {
    properties?: Record<string, JsonProp>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  const required = (schema.required ?? []).map(String);
  const params: Record<string, unknown> = {};
  for (const key of required) {
    const p = props[key];
    if (!p) {
      params[key] = '';
      continue;
    }
    if (p.default !== undefined) params[key] = p.default;
    else if (Array.isArray(p.enum) && p.enum.length > 0) params[key] = p.enum[0];
    else if (p.type === 'array') params[key] = [];
    else if (p.type === 'boolean') params[key] = false;
    else if (p.type === 'number' || p.type === 'integer') params[key] = 0;
    else params[key] = '';
  }
  return { params };
}

function CurlBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Typography.Text strong style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <Input.TextArea
        readOnly
        rows={Math.min(10, Math.max(3, value.split('\n').length + 1))}
        value={value}
        style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
      />
    </div>
  );
}

type Props = {
  manifest: PublishedApiManifest;
  baseUrl?: string;
};

export function OpenApiIntegrationContent({ manifest, baseUrl }: Props) {
  const { t } = useTranslation();
  const origin =
    baseUrl?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://your-gateway.example.com');

  const fields = useMemo(() => schemaFieldRows(manifest), [manifest]);
  const doc = manifest.inputDoc as PublishedApiInputDocView;
  const exampleBody = useMemo(() => buildExampleRunBody(manifest), [manifest]);
  const exampleBodyJson = JSON.stringify(exampleBody, null, 2);

  const runCurl =
    manifest.curlExamples?.run ||
    `curl -sS -X POST "${origin}/api/v1/open/${manifest.slug}/run" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer mxm_YOUR_API_KEY" \\
  -d '${JSON.stringify(exampleBody)}'`;

  const pollCurl =
    manifest.curlExamples?.pollJob ||
    `curl -sS "${origin}/api/v1/open/${manifest.slug}/jobs/JOB_ID" -H "Authorization: Bearer mxm_YOUR_API_KEY"`;

  const manifestCurl =
    manifest.curlExamples?.getManifest ||
    `curl -sS "${origin}/api/v1/open/${manifest.slug}" -H "Authorization: Bearer mxm_YOUR_API_KEY"`;

  const bodyKey = manifest.kind === 'task_v2' ? 'params' : 'input_data';

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <PageHintsBar>
        <PageHint
          title={t('assets.openApi.howToParams')}
          description={t('assets.openApi.howToParamsDesc')}
        />
        {doc.notes?.length ? (
          <PageHint tone="warning" title={t('assets.openApi.notes')} description={doc.notes.join(' ')} />
        ) : null}
      </PageHintsBar>

      {manifest.description ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {manifest.description}
        </Typography.Paragraph>
      ) : null}

      <Descriptions size="small" column={2} bordered>
        <Descriptions.Item label={t('assets.openApi.type')}>
          <Tag color={manifest.kind === 'smartflow' ? 'purple' : 'blue'}>
            {manifest.kind === 'smartflow' ? t('assets.openApi.kindSmartflow') : t('assets.openApi.kindTaskV2')}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('assets.openApi.schemaVersion')}>v{manifest.schemaVersion}</Descriptions.Item>
        <Descriptions.Item label={t('assets.openApi.runBodyWrap')} span={2}>
          <Typography.Text code>
            {manifest.kind === 'task_v2'
              ? '{ "params": { ... } }'
              : '{ "input_data": { ... } }'}
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>

      <div>
        <Typography.Text strong>{t('assets.openApi.inputFields')}</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          {t('assets.openApi.inputFieldsHint', { bodyKey })}
        </Typography.Paragraph>
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 520 }}
          dataSource={fields}
          columns={[
            { title: t('assets.openApi.field'), dataIndex: 'name', width: 120, render: (v) => <Typography.Text code>{v}</Typography.Text> },
            { title: t('assets.openApi.fieldType'), dataIndex: 'type', width: 140 },
            {
              title: t('assets.openApi.required'),
              dataIndex: 'required',
              width: 56,
              render: (v: boolean) => (v ? <Tag color="red">{t('assets.openApi.yes')}</Tag> : <Tag>{t('assets.openApi.no')}</Tag>),
            },
            { title: t('assets.openApi.description'), dataIndex: 'description' },
          ]}
        />
        {fields.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('assets.openApi.emptyInputHint', { bodyKey })}
          </Typography.Text>
        ) : null}
      </div>

      {doc.referenceImageSlots?.length ? (
        <div>
          <Typography.Text strong>{t('assets.openApi.refImageFields')}</Typography.Text>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>
            {doc.referenceImageSlots.map((slot) => (
              <li key={slot.field}>
                <Typography.Text code>{slot.field}</Typography.Text>
                {slot.title ? `（${slot.title}）` : ''}
                {slot.description ? ` — ${slot.description}` : ''}
                {slot.maxItems != null ? t('assets.openApi.maxItems', { count: slot.maxItems }) : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <Typography.Text strong>{t('assets.openApi.requestBodyExample')}</Typography.Text>
        <Input.TextArea
          readOnly
          rows={Math.min(16, exampleBodyJson.split('\n').length + 2)}
          value={exampleBodyJson}
          style={{ marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
        />
      </div>

      <CurlBlock label={t('assets.openApi.curlManifest')} value={manifestCurl} />
      <CurlBlock label={t('assets.openApi.curlRun', { bodyKey })} value={runCurl} />
      <CurlBlock label={t('assets.openApi.curlPoll')} value={pollCurl} />

      <Collapse
        size="small"
        items={[
          {
            key: 'schema',
            label: t('assets.openApi.fullInputSchema'),
            children: (
              <Input.TextArea
                readOnly
                rows={12}
                value={JSON.stringify(manifest.inputSchema, null, 2)}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
