import { useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Input } from 'antd';
import BrandLoading from '../BrandLoading';
import { FileText, FolderOpen, Upload as UploadIcon, X } from 'lucide-react';
import {
  DEFAULT_TEXT_FILE_ACCEPT,
  extractTextFromFile,
  isMarkdownFile,
  isPdfFile,
} from '../../lib/extractTextFromFile';
import { MediaKnowledgeFolderPickerModal } from '../media-source/MediaKnowledgeFolderPickerModal';
import type { MediaPickPayload } from '../media-source/types';
import {
  DocumentReaderShell,
  MarkdownReader,
  PdfJsReader,
  PlainTextReader,
} from '../document-reader';
import '../schema-form/reference-images.css';
import '../schema-fields/voiceover-audio.css';
import './text-file-or-paste-field.css';

export type TextFileOrPasteMode = 'paste' | 'file' | 'knowledge';

export type TextFileOrPasteValue = {
  mode: TextFileOrPasteMode;
  text: string;
  fileName?: string;
  knowledgeFolderLinkId?: string;
  knowledgeFolderLinkLabel?: string;
  /** @deprecated 兼容旧表单，提交时仅使用 text */
  writingTaskId?: string;
  writingTaskLabel?: string;
};

type TextFileOrPasteFieldProps = {
  value: unknown;
  onChange: (next: TextFileOrPasteValue) => void;
  rows?: number;
  accept?: string;
  maxChars?: number;
  /** 引导步等窄栏：去掉外层厚边框，压缩高度 */
  embedded?: boolean;
  className?: string;
};

function normalizeValue(raw: unknown): TextFileOrPasteValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    if (typeof raw === 'string' && raw.trim()) {
      return { mode: 'paste', text: raw };
    }
    return { mode: 'paste', text: '' };
  }
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text : '';
  const fileName = typeof o.fileName === 'string' ? o.fileName : undefined;

  if (o.mode === 'file') {
    return { mode: 'file', text, fileName };
  }

  if (o.mode === 'knowledge' || o.mode === 'virtual') {
    return {
      mode: 'knowledge',
      text,
      fileName,
      knowledgeFolderLinkId:
        typeof o.knowledgeFolderLinkId === 'string' ? o.knowledgeFolderLinkId : undefined,
      knowledgeFolderLinkLabel:
        typeof o.knowledgeFolderLinkLabel === 'string' ? o.knowledgeFolderLinkLabel : undefined,
    };
  }

  if (o.mode === 'writing') {
    const writingTaskId = typeof o.writingTaskId === 'string' ? o.writingTaskId : undefined;
    const writingTaskLabel = typeof o.writingTaskLabel === 'string' ? o.writingTaskLabel : undefined;
    if (text.trim()) {
      return { mode: 'paste', text, fileName };
    }
    return {
      mode: 'knowledge',
      text: '',
      knowledgeFolderLinkId: writingTaskId,
      knowledgeFolderLinkLabel: writingTaskLabel,
    };
  }

  return { mode: 'paste', text, fileName };
}

function emptyValue(mode: TextFileOrPasteMode = 'paste'): TextFileOrPasteValue {
  return {
    mode,
    text: '',
    fileName: undefined,
    knowledgeFolderLinkId: undefined,
    knowledgeFolderLinkLabel: undefined,
  };
}

export function TextFileOrPasteField({
  value,
  onChange,
  rows = 6,
  accept = DEFAULT_TEXT_FILE_ACCEPT,
  maxChars = 120_000,
  embedded = false,
  className,
}: TextFileOrPasteFieldProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  /** 用户点选的面板；knowledge 有内容时强制高亮「我的资源」 */
  const [panelIntent, setPanelIntent] = useState<'paste' | 'file' | 'knowledge'>('paste');

  const state = normalizeValue(value);
  const activeTab: 'paste' | 'file' | 'knowledge' =
    state.mode === 'knowledge' && state.text.trim()
      ? 'knowledge'
      : state.mode === 'file'
        ? 'file'
        : panelIntent === 'knowledge'
          ? 'knowledge'
          : state.mode === 'paste'
            ? 'paste'
            : panelIntent;

  const emit = (next: TextFileOrPasteValue) => {
    const trimmed = next.text.length > maxChars ? next.text.slice(0, maxChars) : next.text;
    onChange({ ...next, text: trimmed });
  };

  const clearAll = () => {
    setError(null);
    setPreviewFile(null);
    setPanelIntent('paste');
    emit(emptyValue('paste'));
  };

  const switchPanel = (mode: 'paste' | 'file' | 'knowledge') => {
    setError(null);
    if (mode === 'knowledge') {
      setPanelIntent('knowledge');
      setResourcesOpen(true);
      return;
    }
    setPanelIntent(mode);
    setPreviewFile(null);
    emit(emptyValue(mode));
  };

  const ingestFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPanelIntent('file');
    try {
      const text = await extractTextFromFile(file);
      setPreviewFile(file);
      emit({
        mode: 'file',
        text,
        fileName: file.name,
      });
      message.success(t('form.textSource.fileRead', { name: file.name }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResourcePick = (item: MediaPickPayload) => {
    const text = (item.textContent ?? item.content ?? '').trim();
    if (!text) {
      message.error('所选文档无可用正文');
      return;
    }
    setError(null);
    setPreviewFile(null);
    setPanelIntent('knowledge');
    emit({
      mode: 'knowledge',
      text,
      knowledgeFolderLinkId: item.sourceTaskId,
      knowledgeFolderLinkLabel: item.sourceLabel,
    });
    message.success(
      t('form.textSource.loadedLink', { name: item.sourceLabel ?? t('form.textSource.myResources') })
    );
  };

  const onDragHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void ingestFile(file);
    },
  };

  const renderFilePreview = () => {
    if (!state.text || !previewFile) return null;

    if (isPdfFile(previewFile)) {
      return (
        <DocumentReaderShell variant="compact" title={state.fileName}>
          <PdfJsReader source={previewFile} />
        </DocumentReaderShell>
      );
    }

    if (isMarkdownFile(previewFile)) {
      return (
        <DocumentReaderShell variant="compact" title={state.fileName}>
          <MarkdownReader content={state.text} />
        </DocumentReaderShell>
      );
    }

    return (
      <DocumentReaderShell variant="compact" title={state.fileName}>
        <PlainTextReader content={state.text} />
      </DocumentReaderShell>
    );
  };

  const selectedLabel =
    state.mode === 'file'
      ? state.fileName
      : state.mode === 'knowledge'
        ? state.knowledgeFolderLinkLabel
        : null;

  const showPastePanel = activeTab === 'paste';
  const showFilePanel = activeTab === 'file';
  const showKnowledgePanel = activeTab === 'knowledge';

  const rootClass = [
    'text-file-or-paste',
    'ref-images__body',
    embedded ? 'text-file-or-paste--embedded' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <div className="ref-images__source-bar text-file-or-paste__tabs">
        <div className="ref-images__source-tabs" role="tablist" aria-label={t('form.textSource.inputAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={showPastePanel}
            className={`ref-images__source-tab${showPastePanel ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchPanel('paste')}
          >
            <FileText size={15} strokeWidth={2} />
            {t('form.textSource.pasteText')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showFilePanel}
            className={`ref-images__source-tab${showFilePanel ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchPanel('file')}
          >
            <UploadIcon size={15} strokeWidth={2} />
            {t('form.textSource.uploadParse')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showKnowledgePanel}
            className={`ref-images__source-tab${showKnowledgePanel ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchPanel('knowledge')}
          >
            <FolderOpen size={15} strokeWidth={2} />
            {t('form.textSource.myResources')}
          </button>
        </div>
      </div>

      {showPastePanel ? (
        <div
          className={`ref-images__panel text-file-or-paste__panel${dragOver ? ' text-file-or-paste__panel--drag' : ''}`}
          {...onDragHandlers}
        >
          <Input.TextArea
            value={state.text}
            onChange={(e) => emit({ mode: 'paste', text: e.target.value, fileName: undefined })}
            placeholder={t('form.textSource.pastePlaceholder')}
            autoSize={{ minRows: Math.min(rows, 4), maxRows: Math.max(rows + 2, 10) }}
            maxLength={maxChars}
          />
          <div className="text-file-or-paste__footer">
            <span className="text-file-or-paste__hint">
              {dragOver ? t('form.textSource.dropRelease') : t('form.textSource.pasteOrDropHint')}
            </span>
            <span className="text-file-or-paste__count">
              {state.text.length.toLocaleString()} / {maxChars.toLocaleString()}
            </span>
          </div>
        </div>
      ) : null}

      {showFilePanel ? (
        <div className="ref-images__panel text-file-or-paste__panel">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            className="text-file-or-paste__hidden-input"
            accept={accept}
            onChange={(e) => void ingestFile(e.target.files?.[0])}
          />
          {!state.text ? (
            <div
              className={`ref-images__dropzone ref-images__dropzone--initial text-file-or-paste__dropzone${dragOver ? ' ref-images__dropzone--drag' : ''}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              onClick={() => fileInputRef.current?.click()}
              {...onDragHandlers}
            >
              {loading ? (
                <BrandLoading />
              ) : (
                <div className="text-file-or-paste__drop-inner">
                  <UploadIcon size={22} strokeWidth={1.75} className="text-file-or-paste__drop-icon" />
                  <p className="text-file-or-paste__drop-title">
                    {dragOver ? t('form.textSource.dropRelease') : t('form.textSource.dropOrClick')}
                  </p>
                  <p className="text-file-or-paste__drop-sub">txt · md · pdf</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-file-or-paste__selected">
              <div className="text-file-or-paste__selected-main">
                <FileText size={18} strokeWidth={2} />
                <div className="text-file-or-paste__selected-copy">
                  <p className="text-file-or-paste__selected-name">{selectedLabel}</p>
                  <p className="text-file-or-paste__selected-meta">
                    {t('form.textSource.charCount', { count: state.text.length.toLocaleString() })}
                  </p>
                </div>
              </div>
              <div className="text-file-or-paste__selected-actions">
                <button type="button" className="text-file-or-paste__link-btn" onClick={() => fileInputRef.current?.click()}>
                  {t('form.textSource.reupload')}
                </button>
                <button type="button" className="text-file-or-paste__icon-btn" aria-label={t('form.textSource.clear')} onClick={clearAll}>
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          {renderFilePreview()}
          {error ? <p className="text-file-or-paste__error">{error}</p> : null}
        </div>
      ) : null}

      {showKnowledgePanel ? (
        <div className="ref-images__panel text-file-or-paste__panel">
          {state.mode === 'knowledge' && state.text.trim() ? (
            <>
              <div className="text-file-or-paste__selected">
                <div className="text-file-or-paste__selected-main">
                  <FolderOpen size={18} strokeWidth={2} />
                  <div className="text-file-or-paste__selected-copy">
                    <p className="text-file-or-paste__selected-name">
                      {selectedLabel || t('form.textSource.myResources')}
                    </p>
                    <p className="text-file-or-paste__selected-meta">
                      {t('form.textSource.charCount', { count: state.text.length.toLocaleString() })}
                    </p>
                  </div>
                </div>
                <div className="text-file-or-paste__selected-actions">
                  <button
                    type="button"
                    className="text-file-or-paste__link-btn"
                    onClick={() => setResourcesOpen(true)}
                  >
                    {t('form.textSource.changeResource')}
                  </button>
                  <button
                    type="button"
                    className="text-file-or-paste__icon-btn"
                    aria-label={t('form.textSource.clear')}
                    onClick={clearAll}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <DocumentReaderShell variant="compact" title={state.knowledgeFolderLinkLabel}>
                <PlainTextReader content={state.text} />
              </DocumentReaderShell>
            </>
          ) : (
            <button
              type="button"
              className="text-file-or-paste__resource-cta"
              onClick={() => setResourcesOpen(true)}
            >
              <FolderOpen size={20} strokeWidth={1.75} />
              <span>
                <strong>{t('form.textSource.openResources')}</strong>
                <em>{t('form.textSource.openResourcesHint')}</em>
              </span>
            </button>
          )}
          {error ? <p className="text-file-or-paste__error">{error}</p> : null}
        </div>
      ) : null}

      <MediaKnowledgeFolderPickerModal
        open={resourcesOpen}
        onClose={() => setResourcesOpen(false)}
        accept="document"
        enableMyUploads
        documentPickMode="text"
        pickSuccessMessage=""
        onPick={handleResourcePick}
      />
    </div>
  );
}
