import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Modal,
  Progress,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import {
  getTask,
  getTaskFormConfig,
  runTaskV2,
  fetchMediaBlobUrl,
  getMediaWriting,
  type TaskFormConfig,
  type TaskRunV2ResponseBody,
} from '../api/client';
import { TaskV2SchemaForm } from '../task-v2/TaskV2SchemaForm';
import { buildDefaultsFromSchema } from '../task-v2/buildDefaultsFromSchema';
import type { SchemaFormValue } from './SchemaForm';

/** 从 request() 返回的 data 中解析 Task v2 运行结果 */
export function parseTaskRunV2Payload(raw: unknown): TaskRunV2ResponseBody {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const inner = (r.data && typeof r.data === 'object' ? r.data : r) as Record<string, unknown>;
  return {
    success: inner.success !== false && r.success !== false,
    taskId: (inner.taskId as string) ?? (r.taskId as string | undefined),
    status: (inner.status as string) ?? (r.status as string | undefined),
    scope: (inner.scope as string) ?? (r.scope as string | undefined),
    taskKey: (inner.taskKey as string) ?? (r.taskKey as string | undefined),
    subtype: (inner.subtype as string | null) ?? (r.subtype as string | null) ?? null,
    syncResult: (inner.syncResult as TaskRunV2ResponseBody['syncResult']) ?? (r.syncResult as TaskRunV2ResponseBody['syncResult']),
    error: (inner.error as string) ?? (r.error as string | undefined),
  };
}

function extractCgiTask(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const task = (body.data ?? body) as Record<string, unknown>;
  if (task && typeof task === 'object' && 'status' in task) return task;
  return null;
}

type FlowStep = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

/** 与业务列表行一致的最小字段 */
export type AdminBusinessTestRow = {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  row: AdminBusinessTestRow | null;
};

const DEFAULT_TEST_PROMPT = '【Admin 测试】请用一两句话确认本业务链路可用。';

export function AdminBusinessTestModal({ open, onClose, row }: Props) {
  const { message } = App.useApp();
  const [formConfig, setFormConfig] = useState<TaskFormConfig | null>(null);
  const [formValues, setFormValues] = useState<SchemaFormValue>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<number | null>(null);
  const [pollStatus, setPollStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const scope = row?.scope ?? '';

  const scopeHint = useMemo(() => {
    switch (scope) {
      case 'text':
        return '本业务为同步纯文本：不写入 cgi_tasks，不产生任务通知；结果在下方直接展示。';
      case 'writing':
      case 'outline':
        return '本业务将创建异步任务并走写作/大纲执行链路；完成后可查看生成文本。';
      case 'graph':
        return '本业务将创建图文任务；完成后可预览图片（走媒体代理）。';
      case 'audio':
        return '本业务将创建语音任务；完成后可试听音频。';
      case 'music':
        return '本业务将创建音乐任务；完成后可试听音频。';
      case 'video':
        return '本业务将创建视频任务；轮询时间可能较长，请耐心等待。';
      default:
        return '将按 Task v2 接口提交参数并展示执行结果。';
    }
  }, [scope]);

  const isSyncText = scope === 'text';

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current);
      } catch {
        // ignore
      }
      blobUrlRef.current = null;
    }
    setMediaBlobUrl(null);
  }, []);

  useEffect(() => {
    if (!open) {
      setFormConfig(null);
      setFormValues({});
      setRunning(false);
      setFlowStep('idle');
      setTaskId(null);
      setPollProgress(null);
      setPollStatus('');
      setErrorMsg(null);
      setSyncText(null);
      setTextPreview(null);
      revokeBlob();
      return;
    }
    if (!row) return;

    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      setErrorMsg(null);
      try {
        const res = await getTaskFormConfig({
          scope: row.scope,
          taskKey: row.type,
          subtype: row.subtype ?? undefined,
        });
        if (cancelled) return;
        if (res.error) {
          setFormConfig(null);
          setErrorMsg(res.error);
          return;
        }
        const raw = res.data as { data?: TaskFormConfig; success?: boolean } | undefined;
        const cfg = raw?.data ?? (res.data as unknown as TaskFormConfig);
        if (cfg?.schema) {
          setFormConfig(cfg);
          setFormValues(buildDefaultsFromSchema(cfg.schema, { fallbackUid: () => `test_${Date.now()}` }));
        } else {
          setFormConfig(null);
          setErrorMsg('未返回表单 schema');
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, row]);

  useEffect(() => {
    return () => revokeBlob();
  }, [revokeBlob]);

  const mediaKind = useMemo(() => {
    if (scope === 'graph') return 'graph';
    if (scope === 'audio') return 'audio';
    if (scope === 'music') return 'music';
    if (scope === 'video') return 'video';
    return null;
  }, [scope]);

  const pollUntilDone = async (id: string) => {
    const maxMs = scope === 'video' ? 300_000 : 180_000;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const res = await getTask(id);
      if (res.error) throw new Error(res.error);
      const task = extractCgiTask(res.data);
      if (!task) throw new Error('无法解析任务详情');
      const st = String(task.status ?? '');
      const prog = task.progress as { progress?: number; status?: string; error?: string } | undefined;
      setPollProgress(typeof prog?.progress === 'number' ? prog.progress : null);
      setPollStatus(st);
      if (prog?.error) {
        throw new Error(prog.error);
      }
      if (st === 'failed' || st === 'cancelled') {
        throw new Error(
          String((task as { error?: unknown }).error ?? prog?.error ?? `任务状态：${st}`)
        );
      }
      if (st === 'completed') {
        return task;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error('轮询超时，请稍后在任务列表中查看');
  };

  const loadTextPreview = async (id: string) => {
    const res = await getMediaWriting(id);
    if (res.error) {
      const g = await getTask(id);
      if (!g.error) {
        const task = extractCgiTask(g.data);
        const meta = task?.result as { metadata?: { text?: string } } | undefined;
        const t = meta?.metadata?.text;
        if (typeof t === 'string') {
          setTextPreview(t);
          return;
        }
      }
      setTextPreview(`（获取正文失败：${res.error}）`);
      return;
    }
    const data = res.data as unknown;
    if (typeof data === 'string') {
      setTextPreview(data);
      return;
    }
    if (data && typeof data === 'object' && 'data' in data) {
      const inner = (data as { data?: unknown }).data;
      setTextPreview(typeof inner === 'string' ? inner : JSON.stringify(inner ?? data, null, 2));
      return;
    }
    setTextPreview(JSON.stringify(data ?? {}, null, 2));
  };

  const handleRun = async () => {
    if (!row || !formConfig?.schema) {
      message.warning('表单未就绪');
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setSyncText(null);
    setTextPreview(null);
    revokeBlob();
    setFlowStep('submitting');
    setTaskId(null);

    const params: Record<string, unknown> = { ...formValues };
    if (typeof params.prompt === 'string' && !String(params.prompt).trim()) {
      params.prompt = DEFAULT_TEST_PROMPT;
    }
    if (params.prompt === undefined && formConfig.schema.properties && 'prompt' in formConfig.schema.properties) {
      params.prompt = DEFAULT_TEST_PROMPT;
    }

    try {
      const res = await runTaskV2({
        scope: row.scope,
        taskKey: row.type,
        subtype: row.subtype ?? null,
        params,
      });
      if (res.error) throw new Error(res.error);

      const payload = parseTaskRunV2Payload(res.data);

      if (isSyncText) {
        setFlowStep('done');
        const t = payload.syncResult?.text?.trim();
        setSyncText(t || '（无文本，请检查模型返回与路由配置）');
        message.success('同步测试完成');
        return;
      }

      const tid = payload.taskId;
      if (!tid) throw new Error('响应中无 taskId');
      setTaskId(tid);
      setFlowStep('polling');

      await pollUntilDone(tid);
      setFlowStep('done');

      if (scope === 'writing' || scope === 'outline') {
        await loadTextPreview(tid);
      } else if (mediaKind) {
        try {
          const url = await fetchMediaBlobUrl(tid, mediaKind);
          revokeBlob();
          blobUrlRef.current = url;
          setMediaBlobUrl(url);
        } catch (me) {
          const g = await getTask(tid);
          const tsk = extractCgiTask(g.data);
          const urls = (tsk?.result as { mediaUrls?: string[] } | undefined)?.mediaUrls;
          setTextPreview(
            `媒体拉取失败：${me instanceof Error ? me.message : String(me)}` +
              (Array.isArray(urls) && urls.length ? `\n\nmediaUrls：\n${urls.join('\n')}` : '')
          );
        }
      } else {
        const g = await getTask(tid);
        const tsk = extractCgiTask(g.data);
        const meta = tsk?.result as { metadata?: Record<string, unknown>; mediaUrls?: string[] } | undefined;
        const txt = meta?.metadata?.text;
        if (typeof txt === 'string') setTextPreview(txt);
        else if (Array.isArray(meta?.mediaUrls) && meta.mediaUrls.length) {
          setTextPreview(`媒体 URL：\n${meta.mediaUrls.join('\n')}`);
        } else {
          setTextPreview(JSON.stringify(tsk?.result ?? {}, null, 2));
        }
      }
      message.success('测试任务已完成');
    } catch (e) {
      const msgText = e instanceof Error ? e.message : String(e);
      setErrorMsg(msgText);
      setFlowStep('error');
      message.error(msgText);
    } finally {
      setRunning(false);
    }
  };

  const stepDefinitions = useMemo(() => {
    if (isSyncText) {
      return [
        { title: '加载配置', description: '拉取 formSchema' },
        { title: '同步调用', description: '余额预检 → 模型 → 返回正文' },
        { title: '结果', description: '下方展示输出' },
      ];
    }
    return [
      { title: '加载配置', description: '拉取 formSchema' },
      { title: '提交任务', description: '创建 cgi_tasks' },
      { title: '异步执行', description: '轮询状态直至完成' },
      { title: '结果预览', description: '文本 / 媒体' },
    ];
  }, [isSyncText]);

  const currentStepIndex = useMemo(() => {
    if (configLoading || !formConfig) return 0;
    if (flowStep === 'idle') return 0;
    if (flowStep === 'submitting') return 1;
    if (flowStep === 'polling') return isSyncText ? 1 : 2;
    if (flowStep === 'done') return stepDefinitions.length - 1;
    if (flowStep === 'error') return Math.min(1, stepDefinitions.length - 1);
    return 0;
  }, [configLoading, formConfig, flowStep, isSyncText, stepDefinitions.length]);

  return (
    <Modal
      title={
        row ? (
          <Space wrap size={8}>
            <span>业务测试</span>
            <Tag color={isSyncText ? 'green' : 'blue'}>{isSyncText ? '同步（无任务表）' : '异步（cgi_tasks）'}</Tag>
            <Typography.Text code>{row.scope}</Typography.Text>
            <span>/</span>
            <Typography.Text code>{row.type}</Typography.Text>
            {row.subtype ? (
              <>
                <span>/</span>
                <Typography.Text code>{row.subtype}</Typography.Text>
              </>
            ) : null}
          </Space>
        ) : (
          '业务测试'
        )
      }
      open={open}
      onCancel={onClose}
      width={760}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button key="run" type="primary" loading={running} disabled={!formConfig?.schema || configLoading} onClick={() => void handleRun()}>
          运行测试
        </Button>,
      ]}
      destroyOnHidden
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert type="info" showIcon message="测试说明" description={scopeHint} />

        {errorMsg && !configLoading ? <Alert type="error" showIcon message={errorMsg} /> : null}

        <Steps
          size="small"
          current={currentStepIndex}
          items={stepDefinitions.map((s, i) => ({
            ...s,
            status: flowStep === 'error' && i === currentStepIndex ? 'error' : undefined,
          }))}
        />

        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            参数（与线上一致的 Schema 表单）
          </Typography.Text>
          <TaskV2SchemaForm
            formConfig={formConfig}
            formValues={formValues}
            onChange={setFormValues}
            loading={configLoading}
            loadingMessage="正在加载表单配置…"
          />
        </div>

        {flowStep === 'polling' && (
          <div>
            <Space orientation="vertical" style={{ width: '100%' }}>
              {taskId ? (
                <Typography.Text type="secondary" copyable>
                  taskId: {taskId}
                </Typography.Text>
              ) : null}
              <Progress
                percent={pollProgress != null ? Math.min(100, Math.max(0, pollProgress)) : undefined}
                status="active"
                format={() => pollStatus || '处理中…'}
              />
            </Space>
          </div>
        )}

        {(syncText || textPreview || mediaBlobUrl) && flowStep === 'done' && (
          <div style={{ marginTop: 8 }}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              输出预览
            </Typography.Title>
            {syncText != null && (
              <Typography.Paragraph
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: 320,
                  overflow: 'auto',
                  padding: 12,
                  background: 'var(--panel-2, rgba(0,0,0,0.04))',
                  borderRadius: 8,
                }}
              >
                {syncText}
              </Typography.Paragraph>
            )}
            {textPreview != null && scope !== 'text' && (
              <Typography.Paragraph
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: 320,
                  overflow: 'auto',
                  padding: 12,
                  background: 'var(--panel-2, rgba(0,0,0,0.04))',
                  borderRadius: 8,
                }}
              >
                {textPreview}
              </Typography.Paragraph>
            )}
            {mediaBlobUrl && scope === 'graph' && (
              <img src={mediaBlobUrl} alt="生成结果" style={{ maxWidth: '100%', borderRadius: 8 }} />
            )}
            {(scope === 'audio' || scope === 'music') && mediaBlobUrl && (
              <audio src={mediaBlobUrl} controls style={{ width: '100%' }} />
            )}
            {scope === 'video' && mediaBlobUrl && <video src={mediaBlobUrl} controls style={{ width: '100%', borderRadius: 8 }} />}
          </div>
        )}
      </Space>
    </Modal>
  );
}
