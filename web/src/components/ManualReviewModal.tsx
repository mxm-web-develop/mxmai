/**
 * 多闸门人工审核弹窗：text / json / image（v1）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { App, Button, Collapse, Image, Input, Modal, Select } from 'antd';
import type { WritingTaskItem } from '../api/client';
import { approveTaskReview, getTaskReviewDraft, type ReviewDraftPayload } from '../api/client';
import {
  loadKnowledgeFolderOptions,
  saveReviewTextToKnowledgeFolder,
} from '../shared/manualReview';
import { VideoTimelineReviewModal } from './video-timeline-review/VideoTimelineReviewModal';
import { MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES } from './manualReviewModalLayout';
import { ManualReviewModalTitle } from './ManualReviewModalTitle';
import { sanitizeReviewHint } from './manualReviewUserCopy';
import { PageHint } from './PageHint';
import {
  resolveReviewJsonFallback,
  resolveReviewTextFallback,
} from '../shared/resolveReviewDraftFallback';
import {
  ReviewBillingBar,
  formatGenerateButtonLabel,
  useReviewBillingEstimate,
} from './billing/ReviewBillingEstimate';
import { WarpGateWizard, type WarpGateField } from './WarpGateWizard';
import { InteractiveCardReviewWizard } from './InteractiveCardReviewWizard';
import {
  ContractBusinessReviewEditor,
  isWarpContractWithBusiness,
  mergeBusinessIntoContract,
  type ContractBusiness,
  type WarpContractLike,
} from './ContractBusinessReviewEditor';
import { WritingChatReviewModal } from './WritingChatReviewModal';
import {
  VoiceoverScriptEditor,
  looksLikeVoiceoverTtsMarkup,
} from './voiceover-script/VoiceoverScriptEditor';
import { DialogueGuidanceTimelineReview } from './DialogueGuidanceTimelineReview';
import type { DialogueGuidanceCast, DialogueGuidanceLine } from '../lib/dialogueGuidanceTimeline';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

type ManualReviewGateMeta = {
  gateId?: string;
  phase?: 'pre' | 'post';
  label?: string;
  hint?: string;
  kind?: string;
  index?: number;
  totalGates?: number;
};

type ManualReviewModalProps = {
  open: boolean;
  task: WritingTaskItem | null;
  title?: string;
  hint?: string;
  /** 强制使用口播 TTS 可视化编辑器（音频页审核） */
  voiceoverScriptEditor?: boolean;
  onClose: () => void;
  onApproved?: () => void;
};

function resolveGateMeta(task: WritingTaskItem | null): ManualReviewGateMeta | undefined {
  const meta = task?.metadata as { manualReviewGate?: ManualReviewGateMeta } | undefined;
  return meta?.manualReviewGate;
}

/** 多角色口播仅 audio/group、audio/series；generator 隐藏相关入口 */
function resolveAllowVoiceoverMultiRole(task: WritingTaskItem | null): boolean {
  if (!task) return false;
  const fromMeta = (
    task.metadata as { taskV2?: { taskKey?: string } } | undefined
  )?.taskV2?.taskKey;
  const fromReq = (
    task.requestParams as
      | { taskV2?: { taskKey?: string }; params?: { taskV2?: { taskKey?: string } } }
      | undefined
  )?.taskV2?.taskKey;
  const fromNested = (
    task.requestParams as { params?: { taskV2?: { taskKey?: string } } } | undefined
  )?.params?.taskV2?.taskKey;
  const taskKey = String(fromMeta ?? fromReq ?? fromNested ?? '').trim().toLowerCase();
  return taskKey === 'group' || taskKey === 'series';
}

function buildTitle(
  task: WritingTaskItem | null,
  override: string | undefined,
  t: (key: string) => string
): string {
  if (override) return override;
  const gate = resolveGateMeta(task);
  if (gate?.label) {
    const idx =
      gate.index && gate.totalGates ? ` (${gate.index}/${gate.totalGates})` : '';
    return `${gate.label}${idx}`;
  }
  return gate?.phase === 'post' ? t('common.manualReview.postTitle') : t('common.manualReview.preTitle');
}

export function ManualReviewModal({
  open,
  task,
  title,
  hint,
  voiceoverScriptEditor = false,
  onClose,
  onApproved,
}: ManualReviewModalProps) {
  const { message } = App.useApp();
  const { t, i18n } = useTranslation();
  const messageRef = useRef(message);
  messageRef.current = message;
  const gateMeta = resolveGateMeta(task);
  const [draft, setDraft] = useState<ReviewDraftPayload | null>(null);
  const [text, setText] = useState('');
  const [jsonText, setJsonText] = useState('');
  /** writing warp：完整合同快照；业务面只编辑 business */
  const [contractSnapshot, setContractSnapshot] = useState<WarpContractLike | null>(null);
  const [businessDraft, setBusinessDraft] = useState<ContractBusiness | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | undefined>();
  const [filename, setFilename] = useState('');
  const [folderOptions, setFolderOptions] = useState<{ value: string; label: string }[]>([]);
  const [savingFile, setSavingFile] = useState(false);

  const gateKind = (gateMeta?.kind as ReviewDraftPayload['kind'] | undefined) ?? undefined;
  const kind = draft?.kind ?? gateKind ?? 'text';
  const isWarpGate = kind === 'interactive-card' || kind === 'basic-form';
  const isWritingChat = kind === 'writing-chat';
  const editable =
    draft?.editable ??
    (kind === 'text' || kind === 'json' || kind === 'video-timeline' || isWarpGate);
  const displayHint = sanitizeReviewHint(
    hint ?? draft?.hint ?? gateMeta?.hint
  ) ?? t('common.manualReview.defaultHint');

  const warpFields = useMemo((): WarpGateField[] => {
    const raw = draft?.metadata?.fields;
    if (!Array.isArray(raw)) return [];
    return raw.filter((f): f is WarpGateField => !!f && typeof f === 'object' && typeof (f as WarpGateField).name === 'string');
  }, [draft?.metadata?.fields]);

  const topicChips = useMemo(() => {
    const raw = draft?.metadata?.topicChips;
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  }, [draft?.metadata?.topicChips]);

  const warpSkippable = draft?.metadata?.skippable === true;
  const warpInitialValues = useMemo(() => {
    const raw = draft?.metadata?.initialValues;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return undefined;
  }, [draft?.metadata?.initialValues]);
  const useGuidedInteractiveCard = useMemo(() => {
    if (kind !== 'interactive-card') return false;
    return warpFields.some((f) => {
      const ui = f['x-ui-type'];
      return (
        ui === 'dialogueCast' ||
        ui === 'textFileOrPaste' ||
        ui === 'minimaxVoice' ||
        f.name === 'cast' ||
        f.name === 'source_material' ||
        f.name === 'voice'
      );
    });
  }, [kind, warpFields]);

  const reviewSurfaceMeta = draft?.metadata?.reviewSurface;
  const useBusinessSurface =
    kind === 'json' &&
    reviewSurfaceMeta !== 'full' &&
    (reviewSurfaceMeta === 'business' ||
      (contractSnapshot != null && isWarpContractWithBusiness(contractSnapshot)));

  useEffect(() => {
    if (!open || !task?.id) return;
    if (gateKind === 'video-timeline') return;

    let cancelled = false;
    setLoadingDraft(true);
    setDraftLoadError(null);
    setDraftRecovered(false);
    setContractSnapshot(null);
    setBusinessDraft(null);
    void getTaskReviewDraft(task.id, gateMeta?.gateId)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          const err = res.error;
          if (/not awaiting review|status=completed/i.test(err)) {
            messageRef.current.warning(t('common.manualReview.notInReview'));
            onClose();
            onApproved?.();
            return;
          }
          throw new Error(err);
        }
        const payload = res.data?.data?.draft ?? null;
        const recovered = Boolean(res.data?.data?.draftRecovered);
        setDraftRecovered(recovered);
        setDraft(payload);

        const apiText = res.data?.data?.text ?? '';
        const resolvedText = resolveReviewTextFallback(task, payload, apiText);
        setText(resolvedText);

        const resolvedJson = resolveReviewJsonFallback(task, payload) ?? payload?.json;
        if (resolvedJson != null) {
          setJsonText(JSON.stringify(resolvedJson, null, 2));
          if (isWarpContractWithBusiness(resolvedJson)) {
            setContractSnapshot(resolvedJson);
            setBusinessDraft({ ...(resolvedJson.business as ContractBusiness) });
          } else {
            setContractSnapshot(null);
            setBusinessDraft(null);
          }
        } else {
          setJsonText('');
          setContractSnapshot(null);
          setBusinessDraft(null);
        }

        if (
          !resolvedText &&
          resolvedJson == null &&
          !payload?.mediaUrls?.length &&
          payload?.kind !== 'interactive-card' &&
          payload?.kind !== 'basic-form'
        ) {
          setDraftLoadError(t('common.manualReview.draftExpired'));
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const errMsg = toUserFacingErrorMessage(e instanceof Error ? e.message : e);
          setDraftLoadError(errMsg);
          messageRef.current.error(errMsg);
          setDraft(null);
          setText(resolveReviewTextFallback(task, null));
          setJsonText('');
          setContractSnapshot(null);
          setBusinessDraft(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, task, gateMeta?.gateId, gateKind, onClose, onApproved, t]);

  useEffect(() => {
    if (!saveOpen) return;
    void loadKnowledgeFolderOptions().then((list) => {
      setFolderOptions(list.map((f) => ({ value: f.id, label: f.name })));
    });
  }, [saveOpen]);

  const mediaUrls = useMemo(() => {
    if (draft?.mediaUrls?.length) return draft.mediaUrls;
    return [];
  }, [draft?.mediaUrls]);

  const reviewPayloadForBilling = useMemo((): Record<string, unknown> | null => {
    if (kind !== 'json') return null;
    if (useBusinessSurface && contractSnapshot && businessDraft) {
      return mergeBusinessIntoContract(contractSnapshot, businessDraft) as Record<string, unknown>;
    }
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* 编辑中 JSON 未合法时暂不估价 */
    }
    return null;
  }, [kind, jsonText, useBusinessSurface, contractSnapshot, businessDraft]);

  const { estimate: reviewEstimate, loading: reviewBillingLoading, blockApprove } =
    useReviewBillingEstimate({
      open,
      task,
      reviewPayload: reviewPayloadForBilling,
      enabled: kind === 'json',
    });

  const handleApprove = async (overrideJson?: Record<string, unknown>) => {
    if (!task?.id) return;
    if (blockApprove) {
      message.warning(reviewEstimate?.message || '余额不足或计费异常，暂不可继续');
      return;
    }
    setSubmitting(true);
    try {
      let reviewJson: unknown = overrideJson;
      if (reviewJson == null && kind === 'json' && useBusinessSurface) {
        if (!contractSnapshot || !businessDraft) {
          message.warning(t('common.manualReview.invalidJson'));
          setSubmitting(false);
          return;
        }
        reviewJson = mergeBusinessIntoContract(contractSnapshot, businessDraft);
      } else if (reviewJson == null && (kind === 'json' || kind === 'video-timeline')) {
        try {
          reviewJson = kind === 'json' ? JSON.parse(jsonText) : draft?.json;
        } catch {
          message.warning(t('common.manualReview.invalidJson'));
          setSubmitting(false);
          return;
        }
      }
      if (isWarpGate && reviewJson == null) {
        reviewJson = {};
      }
      const reviewTextForSave =
        kind === 'json' && useBusinessSurface && reviewJson != null
          ? JSON.stringify(reviewJson, null, 2)
          : kind === 'text' || kind === 'json'
            ? text.trim() || jsonText.trim()
            : undefined;
      const res = await approveTaskReview(task.id, {
        gateId: gateMeta?.gateId ?? draft?.gateId,
        reviewText: reviewTextForSave,
        reviewJson:
          kind === 'json' || kind === 'video-timeline' || isWarpGate ? reviewJson : undefined,
        approved: true,
      });
      if (res.error) throw new Error(res.error);
      message.success(t('common.manualReview.submitted'));
      onApproved?.();
      onClose();
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveToFolder = async () => {
    const content =
      kind === 'json' && useBusinessSurface && contractSnapshot && businessDraft
        ? JSON.stringify(mergeBusinessIntoContract(contractSnapshot, businessDraft), null, 2)
        : (kind === 'json' ? jsonText : text).trim();
    if (!content) {
      message.warning(t('common.manualReview.emptyContent'));
      return;
    }
    if (!folderId) {
      message.warning(t('common.manualReview.selectFolder'));
      return;
    }
    setSavingFile(true);
    try {
      await saveReviewTextToKnowledgeFolder({
        text: content,
        knowledgeFolderId: folderId,
        filename: filename.trim() || undefined,
      });
      message.success(t('common.manualReview.savedToFolder'));
      setSaveOpen(false);
    } catch (e) {
      message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e));
    } finally {
      setSavingFile(false);
    }
  };

  const confirmLabel =
    gateMeta?.phase === 'post' ? t('common.manualReview.confirmOutput') : t('common.manualReview.startGenerate');

  const useVoiceoverEditor =
    kind === 'text' &&
    (voiceoverScriptEditor ||
      looksLikeVoiceoverTtsMarkup(text) ||
      String(task?.type ?? '').toLowerCase().includes('audio'));
  const allowVoiceoverMultiRole = resolveAllowVoiceoverMultiRole(task);

  const dialogueReviewMeta = useMemo(() => {
    const raw = draft?.metadata?.dialogueReview;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as {
      lines?: unknown;
      cast?: unknown;
      broadcast_style?: unknown;
    };
    if (!Array.isArray(o.lines) || o.lines.length === 0) return null;
    return {
      lines: o.lines as DialogueGuidanceLine[],
      cast: (Array.isArray(o.cast) ? o.cast : []) as DialogueGuidanceCast[],
      broadcastStyle:
        typeof o.broadcast_style === 'string' ? o.broadcast_style : undefined,
    };
  }, [draft?.metadata?.dialogueReview]);

  const useDialogueGuidanceTimeline =
    allowVoiceoverMultiRole &&
    (draft?.metadata?.ui === 'dialogue-guidance-timeline' || dialogueReviewMeta != null) &&
    dialogueReviewMeta != null;

  if (kind === 'video-timeline' || gateKind === 'video-timeline') {
    return (
      <VideoTimelineReviewModal
        open={open}
        task={task}
        title={buildTitle(task, title, t)}
        hint={displayHint}
        onClose={onClose}
        onApproved={onApproved}
      />
    );
  }

  if (isWritingChat) {
    return (
      <WritingChatReviewModal
        open={open}
        task={task}
        title={buildTitle(task, title, t)}
        hint={displayHint}
        onClose={onClose}
        onApproved={onApproved}
      />
    );
  }

  if (isWarpGate) {
    return (
      <Modal
        open={open}
        title={<ManualReviewModalTitle title={buildTitle(task, title, t)} hint={displayHint} />}
        width={560}
        centered
        className="manual-review-modal manual-review-modal--warp-gate"
        onCancel={onClose}
        destroyOnHidden
        footer={null}
      >
        <div className="manual-review-modal__body mxm-form-surface">
          {loadingDraft ? (
            <p className="manual-review-modal__empty">{t('common.manualReview.loadingDraft')}</p>
          ) : draftLoadError ? (
            <p className="manual-review-modal__error-hint">{draftLoadError}</p>
          ) : useGuidedInteractiveCard ? (
            <InteractiveCardReviewWizard
              label={draft?.label ?? gateMeta?.label}
              hint={displayHint}
              fields={warpFields}
              initialValues={warpInitialValues}
              topicChips={topicChips}
              submitting={submitting}
              onSubmit={(vals) => void handleApprove(vals)}
            />
          ) : (
            <WarpGateWizard
              kind={kind}
              label={draft?.label ?? gateMeta?.label}
              hint={displayHint}
              fields={warpFields}
              topicChips={topicChips}
              skippable={warpSkippable}
              submitting={submitting}
              nextLabel="下一步"
              finalLabel="提交"
              onSubmit={(vals) => void handleApprove(vals)}
              onSkip={() => void handleApprove({})}
            />
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={<ManualReviewModalTitle title={buildTitle(task, title, t)} hint={displayHint} />}
      width="100%"
      centered={false}
      wrapClassName="manual-review-modal-wrap--fullscreen"
      className="manual-review-modal manual-review-modal--fullscreen"
      styles={MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <div className="manual-review-modal__footer">
          {kind === 'json' ? (
            <ReviewBillingBar estimate={reviewEstimate} loading={reviewBillingLoading} />
          ) : null}
          <Button onClick={onClose} disabled={submitting}>
            {t('common.manualReview.handleLater')}
          </Button>
          <Button
            type="primary"
            loading={submitting}
            disabled={kind === 'json' && (blockApprove || reviewBillingLoading)}
            onClick={() => void handleApprove()}
          >
            {kind === 'json'
              ? formatGenerateButtonLabel(confirmLabel, reviewEstimate, reviewBillingLoading, {
                  insufficientBalance: !!(
                    reviewEstimate &&
                    !reviewEstimate.allowed &&
                    !reviewEstimate.isAdmin &&
                    reviewEstimate.hasPricing !== false
                  ),
                  locale: toAppLang(i18n.language),
                })
              : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="manual-review-modal__body mxm-form-surface">
        {draftRecovered ? (
          <p className="manual-review-modal__recovered-hint">
            {t('common.manualReview.draftRecovered')}
          </p>
        ) : null}
        {draftLoadError ? (
          <p className="manual-review-modal__error-hint">{draftLoadError}</p>
        ) : null}
        {kind === 'image' || kind === 'composite' || kind === 'media' ? (
          <div className="manual-review-modal__media">
            {mediaUrls.length > 0 ? (
              <Image.PreviewGroup>
                {mediaUrls.map((url) => (
                  <Image key={url} src={url} alt={t('common.manualReview.previewAlt')} style={{ maxHeight: 360 }} />
                ))}
              </Image.PreviewGroup>
            ) : (
              <p className="manual-review-modal__empty">{t('common.manualReview.noMedia')}</p>
            )}
          </div>
        ) : kind === 'json' ? (
          useBusinessSurface && businessDraft != null ? (
            <ContractBusinessReviewEditor
              business={businessDraft}
              disabled={loadingDraft || !editable}
              onChange={setBusinessDraft}
            />
          ) : (
            <Input.TextArea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              autoSize={{ minRows: 14, maxRows: 28 }}
              placeholder={loadingDraft ? t('common.manualReview.loadingJson') : '{ }'}
              disabled={loadingDraft || !editable}
              className="manual-review-modal__editor"
            />
          )
        ) : useDialogueGuidanceTimeline && dialogueReviewMeta ? (
          <DialogueGuidanceTimelineReview
            key={draft?.gateId ?? task?.id ?? 'dgt'}
            lines={dialogueReviewMeta.lines}
            cast={dialogueReviewMeta.cast}
            broadcastStyle={dialogueReviewMeta.broadcastStyle}
            disabled={loadingDraft || !editable}
            onChangeScript={setText}
          />
        ) : useVoiceoverEditor ? (
          <VoiceoverScriptEditor
            value={text}
            onChange={setText}
            disabled={loadingDraft || !editable}
            allowMultiRole={allowVoiceoverMultiRole}
            placeholder={
              loadingDraft
                ? t('common.manualReview.loadingDraft')
                : t('common.manualReview.editorPlaceholder')
            }
          />
        ) : (
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoSize={{ minRows: 14, maxRows: 28 }}
            placeholder={loadingDraft ? t('common.manualReview.loadingDraft') : t('common.manualReview.editorPlaceholder')}
            disabled={loadingDraft || !editable}
            className="manual-review-modal__editor"
          />
        )}

        {(kind === 'text' || kind === 'json') && editable ? (
          <Collapse
            ghost
            className="manual-review-modal__collapse"
            items={[
              {
                key: 'save',
                label: t('common.manualReview.saveCollapse'),
                children: (
                  <div className="manual-review-modal__save">
                    <div className="manual-review-modal__save-head">
                      <PageHint
                        title={t('common.manualReview.saveTitle')}
                        description={t('common.manualReview.saveDescription')}
                        placement="left"
                      />
                    </div>
                    <Select
                      showSearch
                      placeholder={t('common.manualReview.folderPlaceholder')}
                      optionFilterProp="label"
                      options={folderOptions}
                      value={folderId}
                      onChange={setFolderId}
                      onDropdownVisibleChange={(v) => v && setSaveOpen(true)}
                    />
                    <Input
                      placeholder={t('common.manualReview.filenamePlaceholder')}
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                    />
                    <Button loading={savingFile} onClick={() => void handleSaveToFolder()}>
                      {t('common.manualReview.saveButton')}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </div>
    </Modal>
  );
}
