import { useMemo, useState } from 'react';
import { Button, Drawer, notification, Select, Typography } from 'antd';
import { runTaskV2 } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTaskV2FormConfig, formatTaskSelectionKey, parseTaskSelectionKey, TaskV2SchemaForm } from '../task-v2';

export default function Text() {
  const { isLoggedIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [resultText, setResultText] = useState<string>('');
  const [resultMeta, setResultMeta] = useState<Record<string, unknown> | null>(null);

  const {
    taskKey,
    setTaskKey,
    subtype,
    setSubtype,
    clearPendingForm,
    taskOptions,
    formConfig,
    formValues,
    setFormValues,
    resetFormValues,
    configLoading,
    listLoading,
  } = useTaskV2FormConfig({ scope: 'text', enabled: isLoggedIn });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const textSelectOptions = useMemo(
    () =>
      taskOptions.map((it) => ({
        label: (() => {
          const tk = (it.taskLabel ?? '').trim() || it.taskKey;
          if (!it.subtype) return tk;
          const st = (it.subtypeLabel ?? '').trim() || it.subtype;
          return `${tk} / ${st}`;
        })(),
        value: formatTaskSelectionKey(it.taskKey, it.subtype),
      })),
    [taskOptions]
  );

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      notification.warning({ message: '暂无可用的文本业务配置', placement: 'top' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope: 'text',
        taskKey,
        subtype,
        params: formValues,
      });
      if (res.error) throw new Error(res.error);

      const raw = res.data as unknown;
      const envelope = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const inner = (envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope) as Record<string, unknown>;
      const sync = (inner.syncResult && typeof inner.syncResult === 'object' ? inner.syncResult : null) as
        | { text?: unknown; metadata?: unknown }
        | null;

      const text = sync?.text;
      const metadata = sync?.metadata;
      setResultText(typeof text === 'string' ? text : text != null ? JSON.stringify(text, null, 2) : '（无输出，请检查模型路由与返回字段）');
      setResultMeta(metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null);

      notification.success({ message: '已完成（同步文本）', placement: 'top' });
      setFormOpen(false);
      resetFormValues();
    } catch (err) {
      notification.error({
        message: '提交失败',
        description: err instanceof Error ? err.message : String(err),
        placement: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Select
        style={{ width: '100%' }}
        placeholder="选择业务（taskKey / subtype）"
        value={taskOptions.length > 0 ? selectedValue : undefined}
        options={textSelectOptions}
        onChange={(v) => {
          const p = parseTaskSelectionKey(String(v));
          setTaskKey(p.taskKey);
          setSubtype(p.subtype);
          clearPendingForm();
        }}
      />
      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
      />
      <Button
        type="primary"
        loading={submitting}
        disabled={!formConfig?.schema}
        onClick={() => void handleSubmit()}
      >
        运行
      </Button>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        提示：`text` 业务为同步执行，不会写入 `cgi_tasks`，也不会出现在写作/图片等任务列表中。
      </Typography.Text>
    </div>
  );

  return (
    <section className="page-card text-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>文本（同步）</div>
          <div className="muted" style={{ fontSize: 12 }}>
            适用于 plan / think / format 等“节点式”文本业务。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen(true)}
            disabled={!isLoggedIn}
          >
            新建文本任务
          </button>
        </div>
      </div>

      {resultText ? (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            输出
          </Typography.Title>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 10,
              background: 'var(--panel-2, rgba(0,0,0,0.04))',
              border: '1px solid rgba(148,163,184,0.22)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 420,
              overflow: 'auto',
            }}
          >
            {resultText}
          </pre>
          {resultMeta ? (
            <details style={{ opacity: 0.9 }}>
              <summary style={{ cursor: 'pointer' }}>metadata</summary>
              <pre style={{ margin: 0, padding: 12, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(resultMeta, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 14 }}>
          暂无输出。点击右上角「新建文本任务」开始。
        </p>
      )}

      <Drawer
        title="新建文本任务（同步）"
        placement="right"
        size={560}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnHidden
      >
        {renderForm()}
      </Drawer>
    </section>
  );
}
