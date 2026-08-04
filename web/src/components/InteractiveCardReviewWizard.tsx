/**
 * 运行时 interactiveCard 审核：与创建引导一致，用 GuidedChatField 分步采集
 *（支持 textFileOrPaste / dialogueCast / minimaxVoice 等富字段）
 */
import { useMemo, useState } from 'react';
import { Typography } from 'antd';
import { GuidedChatField } from './GuidedChatField';
import type { WarpGateField } from './WarpGateWizard';
import { userFacingCopy } from '../lib/uiCopyHygiene';

export type InteractiveCardReviewWizardProps = {
  label?: string;
  hint?: string;
  fields: WarpGateField[];
  initialValues?: Record<string, unknown>;
  topicChips?: string[];
  submitting?: boolean;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
};

export function InteractiveCardReviewWizard({
  label,
  hint,
  fields,
  initialValues,
  topicChips = [],
  submitting = false,
  onSubmit,
}: InteractiveCardReviewWizardProps) {
  const steps = useMemo(
    () => (fields.length > 0 ? fields : [{ name: '_empty', title: '继续' } as WarpGateField]),
    [fields]
  );
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = { ...(initialValues ?? {}) };
    for (const f of fields) {
      if (init[f.name] != null) continue;
      if (f.default != null) init[f.name] = f.default;
      else if (f.defaultObject != null) init[f.name] = f.defaultObject;
    }
    return init;
  });

  const current = steps[Math.min(step, steps.length - 1)]!;
  const isLast = step >= steps.length - 1;

  return (
    <div className="interactive-card-review-wizard">
      <div className="interactive-card-review-wizard__head" style={{ marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {label || '请确认'}
        </Typography.Title>
        {hint ? (
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {userFacingCopy(hint, '')}
          </Typography.Paragraph>
        ) : null}
        <div
          className="warp-gate-wizard__progress"
          aria-hidden
          style={{ display: 'flex', gap: 6, marginTop: 10 }}
        >
          {steps.map((f, i) => (
            <span
              key={`${f.name}_${i}`}
              className={
                i === step
                  ? 'warp-gate-wizard__dot warp-gate-wizard__dot--active'
                  : i < step
                    ? 'warp-gate-wizard__dot warp-gate-wizard__dot--done'
                    : 'warp-gate-wizard__dot'
              }
            />
          ))}
        </div>
      </div>
      <GuidedChatField
        key={`${current.name}_${step}`}
        field={current}
        topicChips={topicChips}
        submitting={submitting}
        contextValues={values}
        onAnswer={(patch) => {
          const next = { ...values, ...patch };
          setValues(next);
          if (isLast) {
            void onSubmit(next);
            return;
          }
          setStep((s) => s + 1);
        }}
      />
    </div>
  );
}
