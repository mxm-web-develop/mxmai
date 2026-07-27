/**
 * 通用分步引导创建：把任意业务 formSchema 拆成 GSAP 一步一字段，填完再提交。
 * 用于无 pre 交互闸门的业务；有闸门的走 WritingWarpGuidedCreate。
 */
import { useState } from 'react';
import { App, Typography } from 'antd';
import {
  runTaskV2,
  type TaskFormConfig,
} from '../api/client';
import {
  TaskBillingBar,
  handleTaskBillingResponseError,
  type TaskBillingState,
} from './billing/TaskBillingBar';
import { WarpGateWizard } from './WarpGateWizard';
import { schemaToWarpFields } from './schemaToWarpFields';
import { pickTaskIdFromRunTaskV2Response, pickParallelFromRunTaskV2Response } from '../task-v2';
import type { AppLocale } from '../i18n/appLocale';

const EMPTY_BILLING_PARAMS: Record<string, unknown> = {};

type Props = {
  scope?: string;
  taskKey: string;
  subtype: string | null;
  formConfig: TaskFormConfig | null;
  loading?: boolean;
  locale: AppLocale;
  mergeTaskLabelIntoParams: (params: Record<string, unknown>) => Record<string, unknown>;
  billing: TaskBillingState;
  onBillingStateChange: (s: TaskBillingState) => void;
  onTaskCreated: (taskId: string) => void;
  onFinished: () => void;
};

export function GuidedSchemaCreate({
  scope = 'writing',
  taskKey,
  subtype,
  formConfig,
  loading,
  locale,
  mergeTaskLabelIntoParams,
  billing,
  onBillingStateChange,
  onTaskCreated,
  onFinished,
}: Props) {
  const { message, notification } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({});

  const fields = schemaToWarpFields(formConfig?.schema ?? null);

  const handleComplete = async (values: Record<string, unknown>) => {
    const merged = { ...draftValues, ...values };
    setDraftValues(merged);
    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope,
        taskKey,
        subtype,
        params: mergeTaskLabelIntoParams(merged),
      });
      if (res.error) {
        if (handleTaskBillingResponseError(res)) return;
        throw new Error(res.error);
      }
      const taskId = pickTaskIdFromRunTaskV2Response(res.data);
      const parallel = pickParallelFromRunTaskV2Response(res.data);
      notification.success({
        message:
          parallel && parallel.total > 1
            ? `已创建 ${parallel.total} 个子任务`
            : '任务已创建',
        description: taskId ?? undefined,
        placement: 'top',
      });
      if (taskId) onTaskCreated(taskId);
      onFinished();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !formConfig?.schema) {
    return <Typography.Text type="secondary">正在加载表单配置…</Typography.Text>;
  }

  if (fields.length === 0) {
    return (
      <div>
        <TaskBillingBar
          scope={scope}
          taskKey={taskKey}
          subtype={subtype}
          params={EMPTY_BILLING_PARAMS}
          enabled
          onStateChange={onBillingStateChange}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          本业务无额外表单字段，确认后直接创建任务。
        </Typography.Paragraph>
        <WarpGateWizard
          kind="basic-form"
          label="确认创建"
          hint="无需填写更多参数"
          fields={[{ name: '_confirm', title: '准备就绪', required: false }]}
          submitting={submitting || billing.loading}
          finalLabel="生成"
          onSubmit={() => void handleComplete({})}
        />
      </div>
    );
  }

  return (
    <div className="guided-schema-create">
      <TaskBillingBar
        scope={scope}
        taskKey={taskKey}
        subtype={subtype}
        params={draftValues}
        enabled={false}
        onStateChange={onBillingStateChange}
      />
      <WarpGateWizard
        key={`${taskKey}::${subtype ?? ''}`}
        kind="basic-form"
        label="分步填写"
        hint="一次只填一项，填完自动进入下一步。"
        fields={fields}
        submitting={submitting}
        nextLabel="下一步"
        finalLabel="生成"
        onSubmit={(vals) => void handleComplete(vals)}
      />
    </div>
  );
}
