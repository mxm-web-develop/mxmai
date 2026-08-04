import { useMemo, useState, useCallback } from 'react';
import { Button, Drawer, notification, Select, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { useTaskScopeLabels } from '../i18n/useTaskScopeLabels';
import { pageCardTitle, PageHint } from '../components/PageHint';
import { runTaskV2 } from '../api/client';
import {
  TaskBillingBar,
  formatGenerateButtonLabel,
  handleTaskBillingResponseError,
  type TaskBillingState,
} from '../components/billing/TaskBillingBar';
import { useAuth } from '../context/AuthContext';
import { toUserFacingErrorMessage } from '../lib/platformErrors';
import {
  useTaskV2FormConfig,
  formatTaskSelectionKey,
  parseTaskSelectionKey,
  TaskV2SchemaForm,
  TaskV2TaskNameField,
  TASK_V2_DRAWER_FORM_CLASS,
  buildTaskSelectionSelectOptions,
} from '../task-v2';

export default function Text() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('text');
  const { isLoggedIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [billing, setBilling] = useState<TaskBillingState>({
    canSubmit: true,
    blockReason: null,
    estimate: null,
    loading: false,
  });
  const onBillingStateChange = useCallback((s: TaskBillingState) => setBilling(s), []);
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
    taskLabel,
    onTaskLabelChange,
    mergeTaskLabelIntoParams,
    resetTaskLabelAfterSubmit,
  } = useTaskV2FormConfig({ scope: 'text', enabled: isLoggedIn, formDrawerOpen: formOpen });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const appLang = toAppLang(i18n.language);
  const textSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, appLang),
    [taskOptions, appLang]
  );

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      notification.warning({ message: t('auth.pleaseLogin'), placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      notification.warning({
        message: t('common.task.noBusinessConfig', { scope: scopeLabels.scopeLabel }),
        placement: 'top',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope: 'text',
        taskKey,
        subtype,
        params: mergeTaskLabelIntoParams({ ...(formValues as Record<string, unknown>) }),
      });
      if (res.error) {
        if (handleTaskBillingResponseError(res)) return;
        throw new Error(res.error);
      }

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
      resetTaskLabelAfterSubmit();
    } catch (err) {
      notification.error({
        message: t('common.submitFailed'),
        description: toUserFacingErrorMessage(err instanceof Error ? err.message : err),
        placement: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => (
    <div className={TASK_V2_DRAWER_FORM_CLASS}>
      <Select
        placeholder={t('common.task.selectBusiness')}
        value={taskOptions.length > 0 ? selectedValue : undefined}
        options={textSelectOptions}
        onChange={(v) => {
          const p = parseTaskSelectionKey(String(v));
          setTaskKey(p.taskKey);
          setSubtype(p.subtype);
          clearPendingForm();
        }}
      />
      <TaskV2TaskNameField value={taskLabel} onChange={onTaskLabelChange} />
      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
      />
      <TaskBillingBar
        scope="text"
        taskKey={taskKey}
        subtype={subtype}
        params={formValues as Record<string, unknown>}
        enabled={!!formConfig?.schema && isLoggedIn}
        onStateChange={onBillingStateChange}
      />
      <Button
        type="primary"
        loading={submitting || billing.loading}
        disabled={!formConfig?.schema || !billing.canSubmit}
        onClick={() => void handleSubmit()}
        style={{ width: '100%' }}
      >
        {formatGenerateButtonLabel(t('common.generate'), billing.estimate, billing.loading, {
          insufficientBalance: billing.blockReason === 'insufficient_balance',
          locale: toAppLang(i18n.language),
        })}
      </Button>
      <PageHint
        title="执行说明"
        label="同步任务"
        description="text 业务为同步执行，不会写入 cgi_tasks，也不会出现在写作/图片等任务列表中。"
      />
    </div>
  );

  return (
    <section className="page-card text-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {pageCardTitle('文本（同步）', {
              title: '适用场景',
              description: '适用于 plan / think / format 等「节点式」文本业务。',
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen(true)}
            disabled={!isLoggedIn}
          >
            {t('generation.create.text')}
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
            <details
              style={{ opacity: 0.9 }}
              className="text-result-meta"
            >
              <summary
                style={{ cursor: 'pointer', padding: '8px 0', fontWeight: 500 }}
              >
                metadata
              </summary>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(resultMeta, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 14 }}>
          {scopeLabels.emptyHint}
        </p>
      )}

      <Drawer
        title={t('generation.create.textSync')}
        placement="right"
        width={560}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnHidden
        styles={{ body: { paddingBottom: 24 } }}
      >
        {renderForm()}
      </Drawer>
    </section>
  );
}
