/**
 * mxm-warp 交互闸门：interactive-card / basic-form 分步采集（GSAP 切换）
 */
import { useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Button, Input, Select, Space, Tag, Typography } from 'antd';
import { prefersReducedMotion } from '../lib/motion/useReducedMotion';
import { userFacingCopy } from '../lib/uiCopyHygiene';
import { FolderCardAtField } from './knowledge-base/FolderCardAtField';

const STYLE_TONE_RECS = [
  '冷静短句，少感叹',
  '先事实后判断，克制评论',
  '清晰好读，少堆行话',
  '有锋芒但不人身攻击',
  '温和亲和，术语轻轻带过',
];

gsap.registerPlugin(useGSAP);

export type WarpGateField = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  default?: string;
  'x-ui'?: string;
  /** schema `x-ui-type`：如 scale（整数滑杆，无自定义） */
  'x-ui-type'?: string;
  minimum?: number;
  maximum?: number;
  /** 与枚举/刻度一一对应的可读文案 */
  'x-enum-labels'?: string[];
  placeholder?: string;
  help?: string;
};

export type WarpGateWizardProps = {
  kind: 'interactive-card' | 'basic-form';
  label?: string;
  hint?: string;
  fields: WarpGateField[];
  topicChips?: string[];
  skippable?: boolean;
  submitting?: boolean;
  /** 非最后一步按钮文案，默认「下一步」 */
  nextLabel?: string;
  /** 最后一步按钮文案，默认「确认并继续」；向导中间阶段可传「下一步」 */
  finalLabel?: string;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
};

function fieldKey(f: WarpGateField, i: number): string {
  return f.name || `field_${i}`;
}

export function WarpGateWizard({
  kind,
  label,
  hint,
  fields,
  topicChips = [],
  skippable = false,
  submitting = false,
  nextLabel = '下一步',
  finalLabel = '下一步',
  onSubmit,
  onSkip,
}: WarpGateWizardProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.default != null) init[f.name] = f.default;
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(() => (fields.length > 0 ? fields : [{ name: '_empty', title: '继续' }]), [fields]);
  const current = steps[Math.min(step, steps.length - 1)]!;
  const isLast = step >= steps.length - 1;
  const isTopic = current['x-ui'] === 'topic-chips' || current.name === 'core_topic';

  useGSAP(
    () => {
      const el = panelRef.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        el,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.38, ease: 'power3.out' }
      );
    },
    { dependencies: [step, current.name] }
  );

  const setField = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const validateCurrent = (): boolean => {
    if (!current.required) return true;
    const v = values[current.name];
    if (v == null || String(v).trim() === '') {
      setError(`请填写「${current.title || current.name}」`);
      return false;
    }
    if (current.name === 'industry' && String(v) === '其他') {
      const custom = String(values.industry_custom ?? '').trim();
      if (!custom) {
        setError('选「其他」时请填写自定义行业');
        return false;
      }
    }
    if (current.name === 'style' && String(v) === '其他') {
      const custom = String(values.style_custom ?? '').trim();
      const folder = String(values.writing_folder_id ?? '').trim();
      if (!custom && !folder) {
        setError('请写一句语气偏好，或用 @ / 推荐选择语感文风');
        return false;
      }
    }
    if (current.name === 'subjective_analysis' && (v === true || v === 'true')) {
      const stance = String(values.analysis_stance ?? '').trim();
      if (!stance) {
        setError('请选择分析立场');
        return false;
      }
    }
    if (current.name === 'date_mode' && String(v) === 'custom') {
      const d = String(values.report_date ?? '').trim();
      if (!d) {
        setError('请填写日期，如 7月22日 或 2026-07-22');
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateCurrent()) return;
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    void onSubmit({ ...values });
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <div className="warp-gate-wizard">
      <div className="warp-gate-wizard__head">
        <Typography.Title level={5} style={{ margin: 0 }}>
          {label || (kind === 'interactive-card' ? '交互卡' : '完善信息')}
        </Typography.Title>
        {hint ? (
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {hint}
          </Typography.Paragraph>
        ) : null}
        <div className="warp-gate-wizard__progress" aria-hidden>
          {steps.map((f, i) => (
            <span
              key={fieldKey(f, i)}
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

      <div ref={panelRef} className="warp-gate-wizard__panel" key={current.name}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          {current.title || current.name}
          {current.required ? <span style={{ color: '#e11d48' }}> *</span> : null}
        </Typography.Text>
        {current.description ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
            {userFacingCopy(current.description, '')}
          </Typography.Paragraph>
        ) : null}

        {Array.isArray(current.enum) && current.enum.length > 0 ? (
          <Select
            style={{ width: '100%' }}
            size="large"
            value={(values[current.name] as string | undefined) ?? undefined}
            placeholder="请选择"
            options={current.enum.map((v) => ({ value: v, label: v }))}
            onChange={(v) => {
              setField(current.name, v);
              if (current.name === 'style' && v !== '其他') {
                setField('style_custom', '');
                setField('writing_folder_id', '');
              }
            }}
          />
        ) : current.name === 'subjective_analysis' ? (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <Space wrap>
              <Button
                type={values[current.name] === false ? 'primary' : 'default'}
                onClick={() => {
                  setField(current.name, false);
                  setField('analysis_stance', '');
                }}
              >
                关闭（纯报道）
              </Button>
              <Button
                type={values[current.name] === true ? 'primary' : 'default'}
                onClick={() => setField(current.name, true)}
              >
                打开
              </Button>
            </Space>
            {values[current.name] === true ? (
              <Select
                style={{ width: '100%' }}
                size="large"
                placeholder="选择分析立场"
                value={(values.analysis_stance as string | undefined) ?? undefined}
                options={[
                  { value: '基于数据客观分析', label: '客观分析' },
                  { value: '基于数据批判性分析', label: '批判性分析' },
                  { value: '基于数据幽默分析', label: '幽默分析' },
                  { value: '基于数据乐观分析', label: '乐观分析' },
                ]}
                onChange={(v) => setField('analysis_stance', v)}
              />
            ) : null}
          </Space>
        ) : isTopic ? (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            {topicChips.length > 0 ? (
              <div className="warp-gate-wizard__chips">
                {topicChips.map((chip) => {
                  const selected = String(values[current.name] ?? '')
                    .split(/[；;\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const checked = selected.includes(chip);
                  return (
                    <Tag.CheckableTag
                      key={chip}
                      checked={checked}
                      onChange={(next) => {
                        const chipParts = selected.filter((x) => topicChips.includes(x));
                        const customParts = selected.filter((x) => !topicChips.includes(x));
                        const nextChips = next
                          ? [...chipParts.filter((x) => x !== chip), chip]
                          : chipParts.filter((x) => x !== chip);
                        setField(current.name, [...nextChips, ...customParts].join('；'));
                      }}
                    >
                      {chip}
                    </Tag.CheckableTag>
                  );
                })}
              </div>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                暂无热门话题推荐，可直接手写；可多选具体事件
              </Typography.Text>
            )}
            <Input.TextArea
              rows={3}
              placeholder="手写补充话题（与上方多选合并，可留空）"
              value={(() => {
                const all = String(values[current.name] ?? '')
                  .split(/[；;\n]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                return all.filter((x) => !topicChips.includes(x)).join('；');
              })()}
              onChange={(e) => {
                const selectedChips = String(values[current.name] ?? '')
                  .split(/[；;\n]+/)
                  .map((s) => s.trim())
                  .filter((x) => topicChips.includes(x));
                const custom = e.target.value.trim();
                setField(
                  current.name,
                  [...selectedChips, ...(custom ? [custom] : [])].join('；')
                );
              }}
            />
          </Space>
        ) : (
          <Input
            size="large"
            placeholder={current.title || current.name}
            value={(values[current.name] as string | undefined) ?? ''}
            onChange={(e) => setField(current.name, e.target.value)}
          />
        )}

        {current.name === 'industry' && values.industry === '其他' ? (
          <Input
            style={{ marginTop: 12 }}
            size="large"
            placeholder="自定义行业名称"
            value={(values.industry_custom as string | undefined) ?? ''}
            onChange={(e) => setField('industry_custom', e.target.value)}
          />
        ) : null}

        {current.name === 'date_mode' && values.date_mode === 'custom' ? (
          <Input
            style={{ marginTop: 12 }}
            size="large"
            placeholder="例：7月22日 / 昨天 / 2026-07-22"
            value={(values.report_date as string | undefined) ?? ''}
            onChange={(e) => setField('report_date', e.target.value)}
          />
        ) : null}

        {current.name === 'style' && values.style === '其他' ? (
          <div style={{ marginTop: 12 }}>
            <FolderCardAtField
              cardTag="writing"
              withText
              textValue={(values.style_custom as string | undefined) ?? ''}
              onTextChange={(v) => setField('style_custom', v)}
              value={
                typeof values.writing_folder_id === 'string' && values.writing_folder_id.trim()
                  ? values.writing_folder_id
                  : null
              }
              onChange={(id) => setField('writing_folder_id', id ?? '')}
              textRecommendations={STYLE_TONE_RECS}
              textPlaceholder="写几句语气偏好，或输入 @ 选择语感文风"
            />
          </div>
        ) : null}

        {error ? (
          <Typography.Text type="danger" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
            {error}
          </Typography.Text>
        ) : null}
      </div>

      <div className="warp-gate-wizard__actions">
        <Space wrap>
          {step > 0 ? (
            <Button onClick={goBack} disabled={submitting}>
              上一步
            </Button>
          ) : null}
          {skippable && isLast ? (
            <Button onClick={() => void onSkip?.()} disabled={submitting}>
              跳过
            </Button>
          ) : null}
          <Button type="primary" loading={submitting} onClick={goNext}>
            {isLast ? finalLabel : nextLabel}
          </Button>
        </Space>
      </div>

      <style>{`
        .warp-gate-wizard { width: 100%; }
        .warp-gate-wizard__progress {
          display: flex; gap: 6px; margin-top: 14px;
        }
        .warp-gate-wizard__dot {
          width: 8px; height: 8px; border-radius: 999px;
          background: rgba(148,163,184,0.45);
        }
        .warp-gate-wizard__dot--active { background: #0284c7; width: 18px; }
        .warp-gate-wizard__dot--done { background: #38bdf8; }
        .warp-gate-wizard__panel {
          margin-top: 18px; min-height: 140px;
          padding: 16px; border-radius: 12px;
          background: rgba(14,165,233,0.04);
          border: 1px solid rgba(14,165,233,0.12);
        }
        .warp-gate-wizard__chips {
          display: flex; flex-wrap: wrap; gap: 8px;
        }
        .warp-gate-wizard__actions { margin-top: 18px; }
      `}</style>
    </div>
  );
}
