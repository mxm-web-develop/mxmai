/**
 * writing-chat 审核：全屏一屏编辑
 * 每路：文章结构 / 写法说明 / 语言风格 / 幽默度 / 检索词 tags
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Input, Modal, Select, Slider, message as antdMessage } from 'antd';
import type { WritingTaskItem } from '../api/client';
import { approveTaskReview, getTaskReviewDraft, type ReviewDraftPayload } from '../api/client';
import { ManualReviewModalTitle } from './ManualReviewModalTitle';
import { MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES } from './manualReviewModalLayout';
import { sanitizeReviewHint } from './manualReviewUserCopy';
import type { WarpGateField } from './WarpGateWizard';
import './writing-create-wizard.css';
import './video-timeline-review/video-timeline-review.css';
import './writing-chat-review.css';

type WritingChatReviewModalProps = {
  open: boolean;
  task: WritingTaskItem | null;
  title: string;
  hint?: string;
  onClose: () => void;
  onApproved?: () => void;
};

type FieldUi = 'tags' | 'text' | 'textarea' | 'scale' | undefined;
type ReviewField = WarpGateField & { phase?: 'routes' | 'meta'; ui?: FieldUi };

const VARIANT_FIELD_RE = /^v__(.+?)__(name|angle|persona|humor_level|search_focus)$/;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[\s,，、]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join(' ');
}

function applyFieldValuesToContract(
  contract: unknown,
  values: Record<string, unknown>
): unknown {
  if (!contract || typeof contract !== 'object') return contract;
  const next = JSON.parse(JSON.stringify(contract)) as Record<string, unknown>;
  const basic = asRecord(next.basic) ?? {};
  next.basic = basic;
  const business = asRecord(next.business) ?? {};
  next.business = business;
  const variants = Array.isArray(business.variants)
    ? ([...business.variants] as Record<string, unknown>[])
    : [];
  business.variants = variants;

  for (const [key, raw] of Object.entries(values)) {
    const m = key.match(VARIANT_FIELD_RE);
    if (!m) continue;
    const id = m[1]!;
    const prop = m[2]!;
    const val = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    const idx = variants.findIndex((v, i) => {
      const vid = String(v.id ?? v.name ?? `v${i + 1}`);
      return vid === id || String(v.id) === id || String(v.name) === id;
    });
    if (idx < 0) continue;
    const v = { ...variants[idx] };
    if (prop === 'persona' || prop === 'humor_level') {
      const sp = asRecord(v.style_profile) ?? {};
      if (prop === 'humor_level') {
        const n = Number(val);
        sp.humor_level = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : val;
      } else {
        sp.persona = val;
        delete sp.voice;
        delete sp.reference_hint;
      }
      v.style_profile = sp;
    } else if (prop === 'name') {
      v.name = val;
      const plan = asRecord(v.structure_plan) ?? {};
      plan.skeleton = val;
      delete plan.rationale;
      v.structure_plan = plan;
    } else if (prop === 'search_focus') {
      v.search_focus = joinTags(splitTags(val));
    } else {
      v[prop] = val;
    }
    delete v.differentiation;
    variants[idx] = v;
  }
  return next;
}

function resolveFields(draft: ReviewDraftPayload | null): ReviewField[] {
  const raw =
    (Array.isArray(draft?.interactiveCardFields) && draft!.interactiveCardFields) ||
    (Array.isArray(draft?.metadata?.fields) && draft!.metadata!.fields) ||
    [];
  return (raw as unknown[])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    // 丢弃已废弃字段（旧 draft 可能仍带 voice/skeleton）
    .filter((f) => {
      const name = typeof f.name === 'string' ? f.name : '';
      return !/__(voice|skeleton)$/.test(name);
    })
    .map((f, i) => {
      const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `field_${i}`;
      const ui: FieldUi =
        f.ui === 'tags' || f.ui === 'textarea' || f.ui === 'scale' || f.ui === 'text'
          ? (f.ui as FieldUi)
          : name.endsWith('__search_focus')
            ? 'tags'
            : name.endsWith('__angle')
              ? 'textarea'
              : name.endsWith('__humor_level')
                ? 'scale'
                : undefined;
      return {
        name,
        type: typeof f.type === 'string' ? f.type : 'string',
        title: typeof f.title === 'string' ? f.title : name,
        description: typeof f.description === 'string' ? f.description : undefined,
        required: f.required === true,
        default: f.default != null ? String(f.default) : undefined,
        enum: Array.isArray(f.enum) ? f.enum.map(String) : undefined,
        phase: f.phase === 'meta' ? 'meta' : 'routes',
        ui,
      } satisfies ReviewField;
    });
}

function shortGuideText(summary: string, fallback: string): string {
  const s = summary.trim();
  if (!s) return fallback;
  const firstPara = s.split(/\n\s*\n/)[0]?.trim() || s;
  if (firstPara.length <= 220) return firstPara;
  return `${firstPara.slice(0, 200).trim()}…`;
}

type RouteGroup = {
  id: string;
  nameField?: ReviewField;
  angleField?: ReviewField;
  personaField?: ReviewField;
  humorField?: ReviewField;
  searchField?: ReviewField;
};

function groupRouteFields(fields: ReviewField[]): RouteGroup[] {
  const order: string[] = [];
  const map = new Map<string, RouteGroup>();
  for (const f of fields) {
    const m = f.name.match(/^v__(.+?)__(name|angle|persona|humor_level|search_focus)$/);
    if (!m) continue;
    const id = m[1]!;
    const prop = m[2]!;
    if (!map.has(id)) {
      order.push(id);
      map.set(id, { id });
    }
    const row = map.get(id)!;
    if (prop === 'name') row.nameField = f;
    if (prop === 'angle') row.angleField = f;
    if (prop === 'persona') row.personaField = f;
    if (prop === 'humor_level') row.humorField = f;
    if (prop === 'search_focus') row.searchField = f;
  }
  return order.map((id) => map.get(id)!);
}

export function WritingChatReviewModal({
  open,
  task,
  title,
  hint,
  onClose,
  onApproved,
}: WritingChatReviewModalProps) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ReviewDraftPayload | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !task?.id) return;
    let cancelled = false;
    setLoadingDraft(true);
    setDraftLoadError(null);
    setValues({});
    void getTaskReviewDraft(task.id, task.metadata?.manualReviewGate?.gateId)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          if (/not awaiting review|status=completed/i.test(res.error)) {
            message.warning(t('common.manualReview.notInReview'));
            onClose();
            onApproved?.();
            return;
          }
          throw new Error(res.error);
        }
        const payload = res.data?.data?.draft ?? null;
        setDraft(payload);
        if (!payload?.json && !payload?.interactiveCardFields && !payload?.metadata?.fields) {
          setDraftLoadError(t('common.manualReview.draftExpired'));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const errMsg = e instanceof Error ? e.message : String(e);
          setDraftLoadError(errMsg);
          antdMessage.error(errMsg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, task, onClose, onApproved, message, t]);

  const displayHint = sanitizeReviewHint(hint) ?? t('common.manualReview.defaultHint');
  const allFields = useMemo(() => resolveFields(draft), [draft]);
  const topicText = String(
    allFields.find((f) => f.name === 'topic')?.default ??
      (draft?.json && typeof draft.json === 'object'
        ? (draft.json as { basic?: { topic?: unknown } }).basic?.topic
        : '') ??
      ''
  ).trim();

  const routeFields = useMemo(
    () => allFields.filter((f) => f.phase !== 'meta' && VARIANT_FIELD_RE.test(f.name)),
    [allFields]
  );
  const routeGroups = useMemo(() => groupRouteFields(routeFields), [routeFields]);
  const evidenceOnly =
    routeFields.length > 0 && routeFields.every((f) => f.name.endsWith('__search_focus'));

  useEffect(() => {
    if (!open || routeFields.length === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const f of routeFields) {
        if (next[f.name] == null) next[f.name] = f.default ?? '';
      }
      return next;
    });
  }, [open, routeFields]);

  const guideBubble = shortGuideText(
    draft?.summary ?? '',
    evidenceOnly
      ? '请用标签调整检索词后重跑。'
      : '一屏确认各路：文章结构、写法说明、语言风格、检索词。结构须是体裁名，不要诗意瞎名。'
  );

  const setField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!task?.id) return;
    for (const f of routeFields) {
      if (!f.required) continue;
      if (!String(values[f.name] ?? '').trim()) {
        message.warning(`请填写「${f.title || f.name}」`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const reviewJson = applyFieldValuesToContract(draft?.json, values);
      const res = await approveTaskReview(task.id, {
        gateId: task.metadata?.manualReviewGate?.gateId ?? draft?.gateId,
        reviewText: typeof draft?.summary === 'string' ? draft.summary : undefined,
        reviewJson,
        approved: true,
      });
      if (res.error) throw new Error(res.error);
      message.success(t('common.manualReview.submitted'));
      onApproved?.();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={<ManualReviewModalTitle title={title} hint={displayHint} />}
      width="100%"
      centered={false}
      maskClosable={false}
      wrapClassName="manual-review-modal-wrap--fullscreen"
      className="manual-review-modal manual-review-modal--fullscreen writing-chat-review-modal"
      styles={MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <div className="manual-review-modal__footer">
          <div className="manual-review-modal__footer-main">
            <div className="manual-review-modal__footer-actions">
              <Button onClick={onClose} disabled={submitting}>
                {t('common.manualReview.handleLater')}
              </Button>
              <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
                {t('common.manualReview.startGenerate')}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="manual-review-modal__body writing-chat-review writing-chat-review--fullscreen mxm-form-surface">
        {loadingDraft ? (
          <p className="manual-review-modal__empty">{t('common.manualReview.loadingDraft')}</p>
        ) : draftLoadError ? (
          <p className="manual-review-modal__error-hint">{draftLoadError}</p>
        ) : (
          <>
            {topicText ? (
              <div className="writing-chat-review__topic" aria-readonly="true">
                <div className="writing-chat-review__topic-label">探索话题</div>
                <div className="writing-chat-review__topic-value">{topicText}</div>
              </div>
            ) : null}
            <p className="writing-chat-review__guide">{guideBubble}</p>

            <div className="writing-chat-review__routes">
              <div className="writing-chat-review__routes-grid">
                {routeGroups.map((g, idx) => (
                  <article key={g.id} className="writing-chat-review__route-card">
                    <header className="writing-chat-review__route-index">路线 {idx + 1}</header>
                    {g.nameField ? (
                      <label className="writing-chat-review__route-field">
                        <span>文章结构</span>
                        <Input
                          value={values[g.nameField.name] ?? ''}
                          onChange={(e) => setField(g.nameField!.name, e.target.value)}
                          placeholder="如：调查报道 / 段子盘点 / 编年档案"
                        />
                      </label>
                    ) : null}
                    {g.angleField ? (
                      <label className="writing-chat-review__route-field">
                        <span>写法说明</span>
                        <Input.TextArea
                          value={values[g.angleField.name] ?? ''}
                          onChange={(e) => setField(g.angleField!.name, e.target.value)}
                          autoSize={{ minRows: 2, maxRows: 3 }}
                          placeholder="这一路怎么按该结构展开"
                        />
                      </label>
                    ) : null}
                    {g.personaField ? (
                      <label className="writing-chat-review__route-field">
                        <span>语言风格</span>
                        <Input
                          value={values[g.personaField.name] ?? ''}
                          onChange={(e) => setField(g.personaField!.name, e.target.value)}
                          placeholder="如：冷静调查记者，短句克制"
                        />
                      </label>
                    ) : null}
                    {g.humorField ? (
                      <label className="writing-chat-review__route-field">
                        <span>
                          幽默度{' '}
                          <em className="writing-chat-review__scale-val">
                            {values[g.humorField.name] ?? '5'}
                          </em>
                        </span>
                        <Slider
                          min={0}
                          max={10}
                          value={Number(values[g.humorField.name] ?? 5) || 0}
                          onChange={(n) => setField(g.humorField!.name, String(n))}
                        />
                      </label>
                    ) : null}
                    {g.searchField ? (
                      <label className="writing-chat-review__route-field">
                        <span>检索词</span>
                        <Select
                          mode="tags"
                          style={{ width: '100%' }}
                          placeholder="回车添加；点 × 删除"
                          value={splitTags(values[g.searchField.name] ?? '')}
                          tokenSeparators={[',', '，', ' ', '、']}
                          onChange={(tags) =>
                            setField(g.searchField!.name, joinTags(tags as string[]))
                          }
                          options={splitTags(values[g.searchField.name] ?? '').map((tg) => ({
                            value: tg,
                            label: tg,
                          }))}
                        />
                      </label>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
