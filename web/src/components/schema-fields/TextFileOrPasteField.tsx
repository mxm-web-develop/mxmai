import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Input, Typography } from 'antd';
import BrandLoading from '../BrandLoading';
import { TaskListLoading } from '../asset-loading';
import { VirtualFolderTreeSidebar } from '../asset-center';
import { VirtualFolderContentList } from '../virtual-folder/VirtualFolderContentList';
import { FileText, FolderOpen, Upload as UploadIcon } from 'lucide-react';
import {
  DEFAULT_TEXT_FILE_ACCEPT,
  extractTextFromFile,
  isMarkdownFile,
  isPdfFile,
} from '../../lib/extractTextFromFile';
import type { VirtualFolderLinkItem } from '../../api/client';
import {
  DocumentReaderShell,
  MarkdownReader,
  PdfJsReader,
  PlainTextReader,
} from '../document-reader';
import {
  buildVirtualFolderBreadcrumb,
  filterBrowsableVirtualFolderItems,
  loadVirtualFolderBrowse,
  loadVirtualFolderTree,
  peekVirtualFolderBrowse,
  resolveVirtualFolderText,
} from './textSourceVirtualFolderUtils';
import { resolveLinkDisplayTitle } from '../virtual-folder/virtualFolderLinkDisplay';
import '../schema-form/reference-images.css';
import '../schema-fields/voiceover-audio.css';
import './text-file-or-paste-field.css';

export type TextFileOrPasteMode = 'paste' | 'file' | 'virtual';

export type TextFileOrPasteValue = {
  mode: TextFileOrPasteMode;
  text: string;
  fileName?: string;
  virtualFolderLinkId?: string;
  virtualFolderLinkLabel?: string;
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

  if (o.mode === 'virtual') {
    return {
      mode: 'virtual',
      text,
      fileName,
      virtualFolderLinkId:
        typeof o.virtualFolderLinkId === 'string' ? o.virtualFolderLinkId : undefined,
      virtualFolderLinkLabel:
        typeof o.virtualFolderLinkLabel === 'string' ? o.virtualFolderLinkLabel : undefined,
    };
  }

  // legacy: writing → 有正文则保留为粘贴，否则进虚拟文件夹模式
  if (o.mode === 'writing') {
    const writingTaskId = typeof o.writingTaskId === 'string' ? o.writingTaskId : undefined;
    const writingTaskLabel = typeof o.writingTaskLabel === 'string' ? o.writingTaskLabel : undefined;
    if (text.trim()) {
      return { mode: 'paste', text, fileName };
    }
    return {
      mode: 'virtual',
      text: '',
      virtualFolderLinkId: writingTaskId,
      virtualFolderLinkLabel: writingTaskLabel,
    };
  }

  return { mode: 'paste', text, fileName };
}

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

  const [vfFolders, setVfFolders] = useState<Awaited<ReturnType<typeof loadVirtualFolderTree>>>([]);
  const [vfSelectedFolderId, setVfSelectedFolderId] = useState<string | null>(null);
  const [vfItems, setVfItems] = useState<Awaited<ReturnType<typeof loadVirtualFolderBrowse>>['items']>([]);
  const [vfLinkCounts, setVfLinkCounts] = useState<Record<string, number>>({});
  const [vfLoading, setVfLoading] = useState(false);
  const [vfRefreshing, setVfRefreshing] = useState(false);
  const [vfFoldersLoading, setVfFoldersLoading] = useState(false);
  const [vfSearch, setVfSearch] = useState('');
  const [vfResolvingId, setVfResolvingId] = useState<string | null>(null);
  const vfInitializedRef = useRef(false);

  const state = normalizeValue(value);

  const emit = (next: TextFileOrPasteValue) => {
    const trimmed = next.text.length > maxChars ? next.text.slice(0, maxChars) : next.text;
    onChange({ ...next, text: trimmed });
  };

  const switchMode = (mode: TextFileOrPasteMode) => {
    if (mode === state.mode) return;
    setError(null);
    setPreviewFile(null);
    emit({
      mode,
      text: '',
      fileName: undefined,
      virtualFolderLinkId: undefined,
      virtualFolderLinkLabel: undefined,
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

  const loadVirtualFoldersOnce = useCallback(async () => {
    setVfFoldersLoading(true);
    try {
      const folders = await loadVirtualFolderTree();
      setVfFolders(folders);
      if (!vfInitializedRef.current && folders.length > 0) {
        vfInitializedRef.current = true;
        setVfSelectedFolderId(folders[0].id);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.textSource.loadVfFailed'));
    } finally {
      setVfFoldersLoading(false);
    }
  }, [message]);

  const loadVirtualFolderItems = useCallback(
    async (folderId: string, force = false) => {
      const cached = !force ? peekVirtualFolderBrowse(folderId) : undefined;
      const hadCache = Boolean(cached?.items);
      if (hadCache) {
        setVfItems(cached!.items!);
        setVfLinkCounts((prev) => ({ ...prev, [folderId]: cached!.links_count ?? 0 }));
        setVfLoading(false);
        setVfRefreshing(true);
      } else {
        setVfLoading(true);
        setVfRefreshing(false);
      }
      try {
        const { items, linksCount } = await loadVirtualFolderBrowse(
          folderId,
          force ? { force: true } : undefined
        );
        setVfItems(items);
        setVfLinkCounts((prev) => ({ ...prev, [folderId]: linksCount }));
      } catch (e) {
        message.error(e instanceof Error ? e.message : t('form.textSource.loadFolderFailed'));
        if (!hadCache) setVfItems([]);
      } finally {
        setVfLoading(false);
        setVfRefreshing(false);
      }
    },
    [message]
  );

  useEffect(() => {
    if (state.mode !== 'virtual') return;
    void loadVirtualFoldersOnce();
  }, [state.mode, loadVirtualFoldersOnce]);

  useEffect(() => {
    if (state.mode !== 'virtual' || !vfSelectedFolderId) return;
    void loadVirtualFolderItems(vfSelectedFolderId);
  }, [state.mode, vfSelectedFolderId, loadVirtualFolderItems]);

  const vfBreadcrumb = buildVirtualFolderBreadcrumb(vfFolders, vfSelectedFolderId);
  const vfDisplayedItems = filterBrowsableVirtualFolderItems(vfItems, vfSearch, true);

  const pickVirtualFolderLink = async (link: VirtualFolderLinkItem) => {
    setVfResolvingId(link.id);
    setError(null);
    setLoading(true);
    try {
      const text = await resolveVirtualFolderText(link);
      const displayTitle = resolveLinkDisplayTitle(link);
      emit({
        mode: 'virtual',
        text,
        virtualFolderLinkId: link.id,
        virtualFolderLinkLabel: displayTitle,
      });
      message.success(t('form.textSource.loadedLink', { name: displayTitle }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      message.error(msg);
    } finally {
      setVfResolvingId(null);
      setLoading(false);
    }
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
        : state.mode === 'virtual'
          ? state.virtualFolderLinkLabel
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

  const renderVirtualFolderPanel = () => (
    <div className="voiceover-audio__vf-layout voiceover-audio__vf-layout--compact">
      <aside className="voiceover-audio__vf-sidebar">
        <div className="vf-link-picker-upload-sidebar-title" style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
          {t('form.textSource.vfTitle')}
        </div>
        {vfFoldersLoading && vfFolders.length === 0 ? (
          <TaskListLoading layout="row-list" kind="writing" count={3} />
        ) : vfFolders.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('form.textSource.vfEmpty')}
          </Typography.Text>
        ) : (
          <VirtualFolderTreeSidebar
            folders={vfFolders}
            selectedFolderId={vfSelectedFolderId}
            onSelect={setVfSelectedFolderId}
            onDeleteFolder={() => undefined}
            getItemCount={(id) => (id ? vfLinkCounts[id] ?? 0 : 0)}
          />
        )}
      </aside>
      <div className="voiceover-audio__vf-main">
        <div className="voiceover-audio__vf-path">
          <FolderOpen size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
          {vfBreadcrumb.length > 0 ? vfBreadcrumb.map((f) => f.name).join(' / ') : t('form.textSource.selectFolder')}
          {vfSelectedFolderId ? (
            <span className="muted">{t('form.textSource.vfScope')}</span>
          ) : null}
        </div>
        <Input
          size="small"
          allowClear
          placeholder={t("form.textSource.searchPlaceholder")}
          value={vfSearch}
          onChange={(e) => setVfSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div className="voiceover-audio__vf-list">
          {!vfSelectedFolderId ? (
            <div className="vf-content-empty">
              <Typography.Text type="secondary">{t('form.textSource.selectFromSidebar')}</Typography.Text>
            </div>
          ) : (
            <VirtualFolderContentList
              items={vfDisplayedItems}
              loading={vfLoading}
              refreshing={vfRefreshing}
              compact
              textOnly
              emptyDescription={vfSearch.trim() ? t('form.textSource.noMatchText') : t('form.textSource.noTextInFolder')}
              onOpenDir={setVfSelectedFolderId}
              onPickLink={(link) => void pickVirtualFolderLink(link)}
              resolvingLinkId={vfResolvingId}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="text-file-or-paste ref-images__body">
      <div className="ref-images__source-bar">
        <div className="ref-images__source-tabs" role="tablist" aria-label={t("form.textSource.inputAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'paste'}
            className={`ref-images__source-tab${state.mode === 'paste' ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchMode('paste')}
          >
            <FileText size={15} />
            {t('form.textSource.pasteText')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'file'}
            className={`ref-images__source-tab${state.mode === 'file' ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchMode('file')}
          >
            <UploadIcon size={15} />
            {t('form.textSource.uploadParse')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'virtual'}
            className={`ref-images__source-tab${state.mode === 'virtual' ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => switchMode('virtual')}
          >
            <FolderOpen size={15} />
            {t('form.textSource.virtualFolder')}
          </button>
        </div>
      </div>

      {state.mode === 'paste' ? (
        <div className="ref-images__panel text-file-or-paste__panel">
          <Input.TextArea
            value={state.text}
            onChange={(e) =>
              emit({ mode: 'paste', text: e.target.value, fileName: undefined })
            }
            placeholder={t("form.textSource.pastePlaceholder")}
            autoSize={{ minRows: rows, maxRows: Math.max(rows + 4, 16) }}
            maxLength={maxChars}
            showCount
          />
          {renderMeta()}
        </div>
      ) : null}

      {state.mode === 'file' ? (
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
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {dragOver ? t('form.textSource.dropRelease') : t('form.textSource.dropOrClick')}
              </Typography.Text>
            )}
          </div>

          {renderMeta()}
          {renderFilePreview()}
          {error ? <p className="text-file-or-paste__error">{error}</p> : null}
        </div>
      ) : null}

      {state.mode === 'virtual' ? (
        <div className="text-file-or-paste__panel text-file-or-paste__panel--virtual">
          {renderVirtualFolderPanel()}
          {state.virtualFolderLinkLabel ? renderMeta() : null}
          {loading && state.mode === 'virtual' ? (
            <div className="text-file-or-paste__writing-loading">
              <BrandLoading size="small" />
              <span>{t('form.textSource.loadingText')}</span>
            </div>
          ) : null}
          {state.text && !loading ? (
            <DocumentReaderShell variant="compact" title={state.virtualFolderLinkLabel}>
              <PlainTextReader content={state.text} />
            </DocumentReaderShell>
          ) : null}
          {error ? <p className="text-file-or-paste__error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
