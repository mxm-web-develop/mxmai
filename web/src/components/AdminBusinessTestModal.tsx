import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
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
  type WritingTaskItem,
} from '../api/client';
import { waitForCgiTask } from '../hooks/useWaitForCgiTask';
import { extractCgiTaskFromApiResponse } from '../notifications/task-snapshot';
import { TaskV2SchemaForm } from '../task-v2/TaskV2SchemaForm';
import { buildDefaultsFromSchema } from '../task-v2/buildDefaultsFromSchema';
import { prepareTaskV2SubmitParams } from '../task-v2/prepareSubmitParams';
import type { SchemaFormValue } from './SchemaForm';
import { PageHint, PageHintsBar } from './PageHint';
import { ManualReviewModal } from './ManualReviewModal';

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

function stripPrivateUiFields<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripPrivateUiFields(item)) as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith('__')) continue;
      out[key] = stripPrivateUiFields(value);
    }
    return out as T;
  }
  return input;
}

type FlowStep = 'idle' | 'submitting' | 'polling' | 'review' | 'done' | 'error';

/** 与业务列表行一致的最小字段 */
export type AdminBusinessTestRow = {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
};

/** 行业日报等：开任务时空参，走 pre 交互卡分步采集 */
function isWarpInteractiveTest(row: AdminBusinessTestRow | null): boolean {
  if (!row) return false;
  return row.scope === 'writing' && row.subtype === 'industry-daily';
}

function toWritingTaskItem(raw: WritingTaskItem | Record<string, unknown> | null): WritingTaskItem | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof (raw as WritingTaskItem).id === 'string' && typeof (raw as WritingTaskItem).status === 'string') {
    return raw as WritingTaskItem;
  }
  return extractCgiTaskFromApiResponse(raw) as WritingTaskItem | null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  row: AdminBusinessTestRow | null;
};

const DEFAULT_TEST_PROMPT = '【Admin 测试】请用一两句话确认本业务链路可用。';

function isInlineImagePreviewUrl(url: string): boolean {
  const u = url.trim();
  if (/^data:image\//i.test(u)) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  const path = u.split('?')[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\b|$)/i.test(path);
}

function truncateForDisplay(s: string, max = 180): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

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
  /** graph 等：任务结果里可直接 <img src> 的地址（如 data:image、CDN 图链） */
  const [inlineImageUrls, setInlineImageUrls] = useState<string[]>([]);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewWaitRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const scope = row?.scope ?? '';
  const warpInteractive = isWarpInteractiveTest(row);

  const scopeHint = useMemo(() => {
    if (warpInteractive) {
      return '行业日报走分步闸门：空参开任务 → 行业交互卡 → 检索 → basic 分步表单 → enrich。请在弹窗中逐步确认。';
    }
    switch (scope) {
      case 'text':
        return '本业务为同步纯文本：不写入 cgi_tasks，不产生任务通知；结果在下方直接展示。';
      case 'writing':
        return '本业务将创建异步任务并走写作执行链路；若遇人工审核/交互卡会弹出闸门，确认后继续。';
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
  }, [scope, warpInteractive]);

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
      setInlineImageUrls([]);
      setReviewTask(null);
      setReviewOpen(false);
      if (reviewWaitRef.current) {
        reviewWaitRef.current.reject(new Error('测试已关闭'));
        reviewWaitRef.current = null;
      }
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

  const waitForReviewApproval = () =>
    new Promise<void>((resolve, reject) => {
      reviewWaitRef.current = { resolve, reject };
    });

  const handleRun = async () => {
    if (!row || !formConfig?.schema) {
      message.warning('表单未就绪');
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setSyncText(null);
    setTextPreview(null);
    setInlineImageUrls([]);
    setReviewOpen(false);
    setReviewTask(null);
    revokeBlob();
    setFlowStep('submitting');
    setTaskId(null);

    const params: Record<string, unknown> = warpInteractive
      ? {}
      : prepareTaskV2SubmitParams({ ...formValues }, formConfig.schema, { scope: row.scope });
    if (!warpInteractive) {
      if (typeof params.prompt === 'string' && !String(params.prompt).trim()) {
        params.prompt = DEFAULT_TEST_PROMPT;
      }
      if (
        params.prompt === undefined &&
        formConfig.schema.properties &&
        'prompt' in formConfig.schema.properties
      ) {
        params.prompt = DEFAULT_TEST_PROMPT;
      }
      if (row.scope === 'graph' && row.subtype && params.type === undefined) {
        params.type = row.subtype;
      }
    }

    /** writing / 闸门业务不可 ephemeral：awaitFullCompletion 会卡在 awaiting_review */
    const useEphemeral = !warpInteractive && scope !== 'writing';

    try {
      const res = await runTaskV2({
        scope: row.scope,
        taskKey: row.type,
        subtype: row.subtype ?? null,
        params,
        ephemeral: useEphemeral,
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

      // 不落库预览：后端直接返回 syncResult
      if (payload.syncResult && useEphemeral) {
        setFlowStep('done');
        if (scope === 'writing') {
          setInlineImageUrls([]);
          const tx = typeof payload.syncResult.text === 'string' ? payload.syncResult.text.trim() : '';
          setTextPreview(tx || JSON.stringify(payload.syncResult.metadata ?? {}, null, 2));
        } else if (scope === 'graph') {
          const urls = (payload.syncResult.mediaUrls ?? []).filter((u): u is string => typeof u === 'string' && u.length > 0);
          const previewable = urls.filter((u) => {
            const t = u.trim();
            if (/^data:image\//i.test(t)) return true;
            if (/^https?:\/\//i.test(t)) return true;
            return isInlineImagePreviewUrl(u);
          });
          const txtRaw = payload.syncResult.metadata?.text;
          const textPart = typeof txtRaw === 'string' && txtRaw.trim() ? txtRaw.trim() : '';
          if (previewable.length > 0) {
            setInlineImageUrls(previewable);
            const notShown = urls.filter((u) => !previewable.includes(u));
            const caption =
              previewable.length === 1
                ? '已生成 1 张图片（下方预览）。'
                : `已生成 ${previewable.length} 张图片（下方预览）。`;
            const tail =
              notShown.length > 0
                ? `\n另有 ${notShown.length} 条 URL 未内联预览：\n${notShown.map((u) => truncateForDisplay(u, 220)).join('\n')}`
                : '';
            setTextPreview(textPart ? `${textPart}\n\n${caption}${tail}` : `${caption}${tail}`);
          } else if (textPart) {
            setInlineImageUrls([]);
            setTextPreview(textPart);
          } else {
            setInlineImageUrls([]);
            setTextPreview(
              typeof payload.syncResult.text === 'string' && payload.syncResult.text.trim()
                ? payload.syncResult.text.trim()
                : JSON.stringify(payload.syncResult.metadata ?? {}, null, 2)
            );
          }
          setMediaBlobUrl(null);
        } else if (
          (scope === 'audio' || scope === 'music' || scope === 'video') &&
          Array.isArray(payload.syncResult.mediaUrls) &&
          typeof payload.syncResult.mediaUrls[0] === 'string' &&
          /^https?:\/\//i.test(payload.syncResult.mediaUrls[0].trim())
        ) {
          setInlineImageUrls([]);
          setMediaBlobUrl(payload.syncResult.mediaUrls[0].trim());
          setTextPreview(null);
        } else {
          setInlineImageUrls([]);
          setMediaBlobUrl(null);
          setTextPreview(
            typeof payload.syncResult.text === 'string' && payload.syncResult.text.trim()
              ? payload.syncResult.text.trim()
              : JSON.stringify(payload.syncResult.metadata ?? payload.syncResult, null, 2)
          );
        }
        message.success('测试任务已完成');
        return;
      }

      const tid = payload.taskId;
      if (!tid) throw new Error('响应中无 taskId');
      setTaskId(tid);

      const maxMs = scope === 'video' ? 480_000 : warpInteractive ? 600_000 : 180_000;
      const perWaitMs = Math.min(maxMs, 240_000);
      let safety = 0;

      while (safety < 12) {
        safety += 1;
        setFlowStep('polling');
        const { task: doneTask, timedOut } = await waitForCgiTask(tid, {
          timeoutMs: perWaitMs,
          stopOnStatuses: ['awaiting_review'],
          onProgress: (patch, st) => {
            setPollProgress(typeof patch.progress?.progress === 'number' ? patch.progress.progress : null);
            setPollStatus(st);
          },
        });
        if (timedOut || !doneTask) {
          throw new Error('等待任务超时，请稍后在任务列表中查看');
        }
        const st = doneTask.status;
        if (st === 'failed' || st === 'cancelled' || st === 'network_error') {
          throw new Error(doneTask.progress?.error ?? `任务状态：${st}`);
        }
        if (st === 'awaiting_review') {
          const item = toWritingTaskItem(doneTask);
          if (!item) throw new Error('审核闸门任务快照无效');
          setReviewTask(item);
          setReviewOpen(true);
          setFlowStep('review');
          setPollStatus('awaiting_review');
          await waitForReviewApproval();
          setReviewOpen(false);
          setReviewTask(null);
          continue;
        }
        if (st !== 'completed') {
          throw new Error(`任务未成功完成：${st}`);
        }
        setFlowStep('done');

        if (scope === 'writing') {
          await loadTextPreview(tid);
        } else if (mediaKind) {
          try {
            const url = await fetchMediaBlobUrl(tid, mediaKind);
            revokeBlob();
            setInlineImageUrls([]);
            blobUrlRef.current = url;
            setMediaBlobUrl(url);
          } catch (me) {
            const g = await getTask(tid);
            const tsk = extractCgiTask(g.data);
            const urls = ((tsk?.result as { mediaUrls?: string[] } | undefined)?.mediaUrls ?? []).filter(
              (u): u is string => typeof u === 'string' && u.length > 0
            );
            const previewable = urls.filter((u) => {
              const t = u.trim();
              if (/^data:image\//i.test(t)) return true;
              if (scope === 'graph' && /^https?:\/\//i.test(t)) return true;
              return isInlineImagePreviewUrl(u);
            });
            setInlineImageUrls(previewable);
            const tail =
              urls.length && previewable.length < urls.length
                ? `\n另有 ${urls.length - previewable.length} 条 URL 未内联预览：\n${urls
                    .filter((u) => !previewable.includes(u))
                    .map((u) => truncateForDisplay(u, 220))
                    .join('\n')}`
                : '';
            setTextPreview(
              `媒体拉取失败：${me instanceof Error ? me.message : String(me)}` +
                (previewable.length ? `\n\n已从任务结果提取 ${previewable.length} 张可预览图片（见下方）。` : '') +
                tail
            );
          }
        } else {
          const g = await getTask(tid);
          const tsk = extractCgiTask(g.data);
          const meta = tsk?.result as { metadata?: Record<string, unknown>; mediaUrls?: string[] } | undefined;
          const urls = Array.isArray(meta?.mediaUrls)
            ? meta.mediaUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
            : [];
          const previewable = urls.filter((u) => {
            const t = u.trim();
            if (/^data:image\//i.test(t)) return true;
            if (scope === 'graph' && /^https?:\/\//i.test(t)) return true;
            return isInlineImagePreviewUrl(u);
          });
          const txtRaw = meta?.metadata?.text;
          const textPart = typeof txtRaw === 'string' && txtRaw.trim() ? txtRaw.trim() : '';

          if (previewable.length > 0) {
            setInlineImageUrls(previewable);
            const notShown = urls.filter((u) => !previewable.includes(u));
            const caption =
              previewable.length === 1
                ? '已生成 1 张图片（下方预览）。'
                : `已生成 ${previewable.length} 张图片（下方预览）。`;
            const tail =
              notShown.length > 0
                ? `\n另有 ${notShown.length} 条 URL 未内联预览：\n${notShown.map((u) => truncateForDisplay(u, 220)).join('\n')}`
                : '';
            setTextPreview(textPart ? `${textPart}\n\n${caption}${tail}` : `${caption}${tail}`);
          } else if (textPart) {
            setInlineImageUrls([]);
            setTextPreview(textPart);
          } else if (urls.length > 0) {
            setInlineImageUrls([]);
            setTextPreview(`媒体 URL：\n${urls.map((u) => truncateForDisplay(u, 220)).join('\n')}`);
          } else {
            setInlineImageUrls([]);
            setTextPreview(JSON.stringify(tsk?.result ?? {}, null, 2));
          }
        }
        message.success('测试任务已完成');
        return;
      }
      throw new Error('闸门次数过多，已中止测试');
    } catch (e) {
      const msgText = e instanceof Error ? e.message : String(e);
      setErrorMsg(msgText);
      setFlowStep('error');
      message.error(msgText);
    } finally {
      setRunning(false);
      setReviewOpen(false);
    }
  };

  const stepDefinitions = useMemo(() => {
    if (isSyncText) {
      return [
        { title: '加载配置', content: '拉取 formSchema' },
        { title: '同步调用', content: '余额预检 → 模型 → 返回正文' },
        { title: '结果', content: '下方展示输出' },
      ];
    }
    if (warpInteractive) {
      return [
        { title: '开任务', content: '空参创建 cgi_tasks' },
        { title: '分步闸门', content: '交互卡 / 检索 / basic' },
        { title: '生成', content: 'enrich → 成文' },
        { title: '结果预览', content: 'Markdown' },
      ];
    }
    return [
      { title: '加载配置', content: '拉取 formSchema' },
      { title: '提交任务', content: '创建 cgi_tasks' },
      { title: '异步执行', content: '轮询 / 审核闸门' },
      { title: '结果预览', content: '文本 / 媒体' },
    ];
  }, [isSyncText, warpInteractive]);

  const currentStepIndex = useMemo(() => {
    if (configLoading || !formConfig) return 0;
    if (flowStep === 'idle') return 0;
    if (flowStep === 'submitting') return 1;
    if (flowStep === 'polling' || flowStep === 'review') return isSyncText ? 1 : 2;
    if (flowStep === 'done') return stepDefinitions.length - 1;
    if (flowStep === 'error') return Math.min(1, stepDefinitions.length - 1);
    return 0;
  }, [configLoading, formConfig, flowStep, isSyncText, stepDefinitions.length]);

  return (
    <>
    <Modal
      title={
        row ? (
          <Space wrap size={8}>
            <span>业务测试</span>
            <Tag color={isSyncText ? 'green' : 'blue'}>{isSyncText ? '同步（无任务表）' : '异步（cgi_tasks）'}</Tag>
            {warpInteractive ? <Tag color="cyan">分步闸门</Tag> : null}
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
          {warpInteractive ? '空参开任务' : '运行测试'}
        </Button>,
      ]}
      destroyOnHidden
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <PageHintsBar>
          <PageHint title="测试说明" description={scopeHint} />
        </PageHintsBar>

        {errorMsg && !configLoading ? <Alert type="error" showIcon title={errorMsg} /> : null}

        <Steps
          size="small"
          current={currentStepIndex}
          items={stepDefinitions.map((s, i) => ({
            ...s,
            status: flowStep === 'error' && i === currentStepIndex ? 'error' : undefined,
          }))}
        />

        {warpInteractive ? (
          <Collapse
            ghost
            items={[
              {
                key: 'prefill',
                label: '高级：预填 Schema 参数（可选，默认空参开任务）',
                children: (
                  <div className="admin-business-test-modal__form mxm-form-surface">
                    <TaskV2SchemaForm
                      formConfig={formConfig}
                      formValues={formValues}
                      onChange={setFormValues}
                      loading={configLoading}
                      loadingMessage="正在加载表单配置…"
                    />
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <div className="admin-business-test-modal__form mxm-form-surface">
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
        )}

        {(flowStep === 'polling' || flowStep === 'review') && (
          <div>
            <Space orientation="vertical" style={{ width: '100%' }}>
              {taskId ? (
                <Typography.Text type="secondary" copyable>
                  taskId: {taskId}
                </Typography.Text>
              ) : null}
              <Progress
                percent={pollProgress != null ? Math.min(100, Math.max(0, pollProgress)) : undefined}
                status={flowStep === 'review' ? 'normal' : 'active'}
                format={() =>
                  flowStep === 'review' ? '等待闸门确认…' : pollStatus || '处理中…'
                }
              />
            </Space>
          </div>
        )}

        {(syncText || textPreview || mediaBlobUrl || inlineImageUrls.length > 0) && flowStep === 'done' && (
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
            {inlineImageUrls.length > 0 && scope === 'graph' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: textPreview != null ? 10 : 0 }}>
                {inlineImageUrls.map((src, i) => (
                  <img
                    key={`${i}-${src.slice(0, 40)}`}
                    src={src}
                    alt={`预览 ${i + 1}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 280,
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.35)',
                      background: 'rgba(0,0,0,0.03)',
                    }}
                  />
                ))}
              </div>
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
    <ManualReviewModal
      open={reviewOpen}
      task={reviewTask}
      onClose={() => {
        setReviewOpen(false);
        if (reviewWaitRef.current) {
          reviewWaitRef.current.reject(new Error('已取消闸门确认'));
          reviewWaitRef.current = null;
        }
      }}
      onApproved={() => {
        if (reviewWaitRef.current) {
          reviewWaitRef.current.resolve();
          reviewWaitRef.current = null;
        }
      }}
    />
    </>
  );
}
