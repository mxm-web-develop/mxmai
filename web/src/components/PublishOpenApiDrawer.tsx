import { useEffect, useMemo, useState } from 'react';
import { App, Button, Descriptions, Drawer, Form, Input, Space, Typography } from 'antd';
import {
  createPublishedApi,
  getOpenApiManifest,
  type PublishedApiManifest,
} from '../api/client';
import {
  OpenApiIntegrationContent,
  parseOpenApiManifestResponse,
} from './OpenApiIntegrationContent';
import { PageHint } from './PageHint';

export type PublishOpenApiPreset =
  | { kind: 'task_v2'; taskV2Scope: string; taskV2TaskKey: string; taskV2Subtype?: string; titleHint?: string }
  | { kind: 'smartflow'; smartflowId: string; titleHint?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  preset: PublishOpenApiPreset | null;
  onPublished?: () => void;
};

export function PublishOpenApiDrawer({ open, onClose, preset, onPublished }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ slug: string; title: string; description?: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [manifest, setManifest] = useState<PublishedApiManifest | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    const stored = localStorage.getItem('api_base_url');
    return (stored && stored.trim()) || window.location.origin;
  }, []);

  useEffect(() => {
    if (!open) {
      setManifest(null);
      setCreatedSlug(null);
      return;
    }
    form.resetFields();
    if (preset?.titleHint) {
      form.setFieldsValue({ title: preset.titleHint });
    }
  }, [open, preset, form]);

  const onSubmit = async () => {
    if (!preset) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const body =
        preset.kind === 'task_v2'
          ? {
              slug: values.slug.trim().toLowerCase(),
              kind: 'task_v2' as const,
              title: values.title.trim(),
              description: values.description?.trim(),
              taskV2Scope: preset.taskV2Scope,
              taskV2TaskKey: preset.taskV2TaskKey,
              taskV2Subtype: preset.taskV2Subtype,
            }
          : {
              slug: values.slug.trim().toLowerCase(),
              kind: 'smartflow' as const,
              title: values.title.trim(),
              description: values.description?.trim(),
              smartflowId: preset.smartflowId,
            };
      const res = await createPublishedApi(body);
      if (res.error) {
        message.error(res.error);
        return;
      }
      message.success('已发布');
      setCreatedSlug(values.slug.trim().toLowerCase());
      onPublished?.();
      const m = await getOpenApiManifest(values.slug.trim().toLowerCase());
      const parsed = parseOpenApiManifestResponse(m);
      if (parsed) setManifest(parsed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={
        <span className="page-card-title-row">
          <span className="page-card-title-row__text">发布为开放 API</span>
          <PageHint
            title="第三方使用自己的 API Key 调用"
            description="slug 创建后不可修改；配置变更后请在「账号中心 → API 发布」重新发布以刷新入参快照。"
          />
        </span>
      }
      open={open}
      onClose={onClose}
      size={640}
      extra={
        !createdSlug ? (
          <Button type="primary" loading={submitting} onClick={() => void onSubmit()}>
            发布
          </Button>
        ) : null
      }
    >
      {!createdSlug ? (
        <Form form={form} layout="vertical">
          <Form.Item
            name="slug"
            label="API slug（URL 路径）"
            rules={[
              { required: true, message: '必填' },
              {
                pattern: /^[a-z0-9][a-z0-9-]{2,63}$/,
                message: '小写字母/数字/连字符，3–64 字符',
              },
            ]}
          >
            <Input placeholder="例如 writing-business-ad" />
          </Form.Item>
          <Form.Item name="title" label="对外标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          {preset?.kind === 'task_v2' ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              目标：{preset.taskV2Scope} / {preset.taskV2TaskKey}
              {preset.taskV2Subtype ? ` / ${preset.taskV2Subtype}` : ''}
            </Typography.Text>
          ) : null}
          {preset?.kind === 'smartflow' ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Smartflow ID：{preset.smartflowId}
            </Typography.Text>
          ) : null}
        </Form>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'slug', label: 'slug', children: <Typography.Text code>{createdSlug}</Typography.Text> },
              {
                key: 'schema',
                label: '文档',
                children: (
                  <Typography.Link href={`${baseUrl}/api/v1/open/${createdSlug}`} target="_blank">
                    GET /api/v1/open/{createdSlug}
                  </Typography.Link>
                ),
              },
              {
                key: 'run',
                label: '运行',
                children: (
                  <Typography.Text code>{`POST ${baseUrl}/api/v1/open/${createdSlug}/run`}</Typography.Text>
                ),
              },
            ]}
          />
          {manifest ? <OpenApiIntegrationContent manifest={manifest} baseUrl={baseUrl} /> : null}
          <Button type="primary" onClick={onClose}>
            完成
          </Button>
        </Space>
      )}
    </Drawer>
  );
}
