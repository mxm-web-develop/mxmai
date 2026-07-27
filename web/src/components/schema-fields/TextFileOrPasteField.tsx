import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Input } from 'antd';
import BrandLoading from '../BrandLoading';
import { FileText, FolderOpen, Upload as UploadIcon } from 'lucide-react';
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

  // legacy: writing → 有正文则保留为粘贴，否则进知识库模式
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

/** 主面板：粘贴 vs 上传解析；「我的资源」走弹窗 */
type PanelMode = 'paste' | 'file';

export function TextFileOrPasteField({
  value,
  onChange,
  rows = 8,
  accept = DEFAULT_TEXT_FILE_ACCEPT,
  maxChars = 120_000,
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

  const state = normalizeValue(value);
  const panelMode: PanelMode = state.mode === 'file' ? 'file' : 'paste';

  const emit = (next: TextFileOrPasteValue) => {
    const trimmed = next.text.length > maxChars ? next.text.slice(0, maxChars) : next.text;
    onChange({ ...next, text: trimmed });
  };

  const switchPanel = (mode: PanelMode) => {
    if (mode === panelMode && state.mode !== 'knowledge') return;
    setError(null);
    setPreviewFile(null);
    emit({
      mode,
      text: '',
      fileName: undefined,
      knowledgeFolderLinkId: undefined,
      knowledgeFolderLinkLabel: undefined,
    });
  };

  const ingestFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError(null);
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

  const renderMeta = () => {
    if (!state.text) return null;
    const label =
      state.mode === 'file'
        ? state.fileName
        : state.mode === 'knowledge'
          ? state.knowledgeFolderLinkLabel
          : null;
    if (!label && state.mode === 'paste') return null;
    return (
      <div className="text-file-or-paste__file-meta">
        {label ? (
          <span>
            {t('form.textSource.selected')}
            <span className="text-file-or-paste__file-name">{label}</span>
          </span>
        ) : (
          <span>{t('form.textSource.pastedText')}</span>
        )}
        <span>{t('form.textSource.charCount', { count: state.text.length.toLocaleString() })}</span>
      </div>
    );
  };

  const showPastePanel = panelMode === 'paste' && state.mode !== 'knowledge';
  const showFilePanel = panelMode === 'file';
  const showKnowledgePreview = state.mode === 'knowledge' && !!state.text;

  return (
    <div className="text-file-or-paste ref-images__body">
      <div className="ref-images__source-bar">
        <div className="ref-images__source-tabs" role="tablist" aria-label={t('form.textSource.inputAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={showPastePanel}
            className={`ref-images__source-tab${showPastePanel ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchPanel('paste')}
          >
            <FileText size={15} />
            {t('form.textSource.pasteText')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showFilePanel && !showKnowledgePreview}
            className={`ref-images__source-tab${showFilePanel && !showKnowledgePreview ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchPanel('file')}
          >
            <UploadIcon size={15} />
            {t('form.textSource.uploadParse')}
          </button>
          <button
            type="button"
            className="ref-images__source-tab"
            onClick={() => setResourcesOpen(true)}
          >
            <FolderOpen size={15} />
            {t('form.textSource.myResources')}
          </button>
        </div>
      </div>

      {showPastePanel ? (
        <div className="ref-images__panel text-file-or-paste__panel">
          <Input.TextArea
            value={state.text}
            onChange={(e) =>
              emit({ mode: 'paste', text: e.target.value, fileName: undefined })
            }
            placeholder={t('form.textSource.pastePlaceholder')}
            autoSize={{ minRows: rows, maxRows: Math.max(rows + 4, 16) }}
            maxLength={maxChars}
            showCount
          />
          {renderMeta()}
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
          <div
            className={`ref-images__dropzone ref-images__dropzone--initial${dragOver ? ' ref-images__dropzone--drag' : ''}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void ingestFile(e.dataTransfer.files?.[0]);
            }}
          >
            {loading ? (
              <BrandLoading />
            ) : (
              <span className="ant-typography ant-typography-secondary" style={{ fontSize: 12 }}>
                {dragOver ? t('form.textSource.dropRelease') : t('form.textSource.dropOrClick')}
              </span>
            )}
          </div>

          {renderMeta()}
          {renderFilePreview()}
          {error ? <p className="text-file-or-paste__error">{error}</p> : null}
        </div>
      ) : null}

      {showKnowledgePreview ? (
        <div className="ref-images__panel text-file-or-paste__panel">
          {renderMeta()}
          <DocumentReaderShell variant="compact" title={state.knowledgeFolderLinkLabel}>
            <PlainTextReader content={state.text} />
          </DocumentReaderShell>
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
