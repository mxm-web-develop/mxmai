/**
 * 写作查看弹窗 - 按细分类型分别渲染（参考 mobile writing-viewer）
 * - storyboard-scripts: 分镜 chunks 卡片
 * - lyrics + suno: Suno JSON 结构化
 * - voice-scripts: 纯文本
 * - articles/其他: Markdown 或纯文本
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, FileText, FolderInput, Presentation, Trash2 } from 'lucide-react';
import { App } from 'antd';
import {
  downloadWritingExport,
  uploadAssets,
  type WritingTaskItem,
} from '../api/client';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import { MediaLoadingState } from './MediaLoadingState';
import {
  MediaViewerHeader,
  MediaViewerHeaderDivider,
  MediaViewerHeaderIconButton,
} from './MediaViewerHeader';
import {
  DocumentReaderShell,
  MarkdownReader,
  PdfJsReader,
  PlainTextReader,
  PptxDeckReader,
  ReaderToolbar,
  type PdfReaderControls,
  type PptxDeckSlide,
} from './document-reader';
import { TaskProgressStage } from './TaskProgressStage';
import { TaskViewerDataPanel } from './TaskViewerDataPanel';
import { useAdminGatedViewerMode } from './viewer/useAdminGatedViewerMode';
import {
  MoveTasksToKnowledgeFolderModal,
  type PrepareKnowledgeLinksResult,
} from './task-list/MoveTasksToKnowledgeFolderModal';
import { pickPresentationDeckMeta, type WritingCollectionTeaser } from './task-list/taskPreviewText';
import './WritingViewerModal.css';

interface WritingViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  content: string;
  /** PDF 预览：同源媒体 URL（pdf.js Range） */
  pdfPreviewUrl?: string | null;
  /** PDF 鉴权头（Bearer / x-user-id） */
  pdfHttpHeaders?: Record<string, string> | null;
  /** PPTX 预览：优先预签名公网 URL（Office Online），否则同源媒体 URL */
  pptxPreviewUrl?: string | null;
  task: WritingTaskItem | null;
  loading?: boolean;
  error?: string | null;
  /** 文集：删除当前篇（父页调 API 并刷新 task） */
  onRemoveCollectionItem?: (itemId: string) => Promise<void>;
}

interface StoryboardChunk {
  index?: number;
  chunk_seconds?: number;
  video_description?: string;
  camera_movement?: string;
  dialogue?: string;
  sound_effects?: string;
  transition?: string;
  characters_in_shot?: string[];
  shot_timeline?: string[];
  shots?: Array<{
    shot_index?: number;
    chunk_seconds?: number;
    video_description?: string;
    dialogue?: string;
    camera_movement?: string;
    sound_effects?: string;
    transition?: string;
    shot_timeline?: string[];
  }>;
  prompt?: string;
}

interface SunoData {
  title?: string;
  prompt: string;
  tags?: string;
  negative_tags?: string;
}

function resolveWritingInfo(task: WritingTaskItem | null): { writingType?: string; format?: string } {
  if (!task) return {};
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const innerParams = params?.params as Record<string, unknown> | undefined;
  return {
    writingType:
      (task.metadata?.writing_type as string) ??
      (params?.writing_type as string) ??
      (innerParams?.writing_type as string) ??
      undefined,
    format: (params?.format as string) ?? (innerParams?.format as string) ?? undefined,
  };
}

type WritingCollectionItem = {
  id: string;
  order: number;
  title: string;
  name?: string;
  angle?: string;
  status: 'ready' | 'failed';
  error?: string;
  manuscript?: string;
  textPreview?: string;
};

type WritingCollectionResult = {
  title?: string;
  itemCount?: number;
  items: WritingCollectionItem[];
};

function extractH1Title(md: string): string {
  const m = String(md || '').match(/^\s*#\s+(.+?)\s*$/m);
  return m?.[1]?.replace(/^[【「『]|[】」』]$/g, '').trim() || '';
}

function isPlaceholderPieceTitle(title: string): boolean {
  return /^(路线|第)\s*\d+(\s*路)?$/.test(title.trim());
}

function shortenChipLabel(label: string, max = 14): string {
  const one = label.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

function isPublicHttpsUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
    if (u.port === '9000' || u.port === '9001') return false;
    return true;
  } catch {
    return false;
  }
}

function readDeckSlidesFromTask(task: WritingTaskItem | null): PptxDeckSlide[] {
  if (!task) return [];
  const meta = {
    ...((task.metadata ?? {}) as Record<string, unknown>),
    ...((task.result?.metadata ?? {}) as Record<string, unknown>),
  };
  const collection = meta.collectionResult;
  const items =
    collection && typeof collection === 'object' && !Array.isArray(collection)
      ? (collection as { items?: unknown }).items
      : null;
  const out: PptxDeckSlide[] = [];
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it !== 'object') continue;
      const o = it as Record<string, unknown>;
      const title = String(o.title ?? o.name ?? `第 ${i + 1} 页`).trim() || `第 ${i + 1} 页`;
      const manuscript = typeof o.manuscript === 'string' ? o.manuscript.trim() : '';
      const preview = typeof o.textPreview === 'string' ? o.textPreview.trim() : '';
      out.push({
        id: String(o.id ?? `s${i + 1}`),
        title,
        subtitle: typeof o.angle === 'string' ? o.angle.trim() : undefined,
        bodyMarkdown: manuscript || preview || undefined,
      });
    }
  }
  if (out.length > 0) return out;

  const teasers = Array.isArray(meta.collectionTeasers) ? meta.collectionTeasers : [];
  for (let i = 0; i < teasers.length; i++) {
    const it = teasers[i];
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const title = String(o.title ?? o.name ?? '').trim();
    if (!title) continue;
    out.push({
      id: String(o.id ?? `t${i + 1}`),
      title,
      subtitle: typeof o.angle === 'string' ? o.angle.trim() : undefined,
      bodyMarkdown: typeof o.textPreview === 'string' ? o.textPreview.trim() : undefined,
    });
  }
  return out;
}

function readWritingCollection(task: WritingTaskItem | null): WritingCollectionResult | null {
  if (!task) return null;
  const fromResult = task.result?.metadata?.collectionResult;
  const fromMeta = task.metadata?.collectionResult;
  const raw = fromResult ?? fromMeta;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const normalized: WritingCollectionItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const manuscript = typeof o.manuscript === 'string' ? o.manuscript.trim() : '';
    const rawTitle = String(o.title ?? o.name ?? '').trim();
    const styleName =
      typeof o.name === 'string' && o.name.trim() ? o.name.trim() : undefined;
    const fromMs = manuscript ? extractH1Title(manuscript) : '';
    // 旧任务「路线 N」：用成稿 H1 + 文风名拼回可读标签
    let title = rawTitle;
    if (!title || isPlaceholderPieceTitle(title)) {
      if (fromMs && styleName && !isPlaceholderPieceTitle(styleName)) {
        title = `${fromMs} · ${styleName}`;
      } else if (fromMs) {
        title = fromMs;
      } else if (styleName && !isPlaceholderPieceTitle(styleName)) {
        title = styleName;
      } else {
        title = `探索稿 ${i + 1}`;
      }
    }
    normalized.push({
      id: String(o.id ?? `v${i + 1}`),
      order: typeof o.order === 'number' ? o.order : i,
      title,
      name: styleName && !isPlaceholderPieceTitle(styleName) ? styleName : undefined,
      angle: typeof o.angle === 'string' && o.angle.trim() ? o.angle.trim() : undefined,
      status: o.status === 'failed' || !manuscript ? 'failed' : 'ready',
      error: typeof o.error === 'string' ? o.error : undefined,
      manuscript: manuscript || undefined,
      textPreview: typeof o.textPreview === 'string' ? o.textPreview : undefined,
    });
  }
  if (normalized.length === 0) return null;
  return {
    title: typeof (raw as { title?: unknown }).title === 'string' ? (raw as { title: string }).title : undefined,
    itemCount: normalized.length,
    items: normalized,
  };
}

function WritingCollectionView({
  collection,
  onMovePiece,
  onDeletePiece,
  busy,
}: {
  collection: WritingCollectionResult;
  onMovePiece?: (item: WritingCollectionItem) => void;
  onDeletePiece?: (item: WritingCollectionItem) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const readyCount = collection.items.filter((i) => i.status === 'ready' && i.manuscript).length;
  const fallbackId =
    collection.items.find((i) => i.status === 'ready' && i.manuscript)?.id ??
    collection.items[0]?.id ??
    '';
  const [activeId, setActiveId] = useState(fallbackId);
  const activeIndex = Math.max(
    0,
    collection.items.findIndex((i) => i.id === activeId)
  );
  const active =
    collection.items.find((i) => i.id === activeId) ??
    collection.items.find((i) => i.status === 'ready' && i.manuscript) ??
    collection.items[0] ??
    null;

  useEffect(() => {
    if (collection.items.some((i) => i.id === activeId)) return;
    const next =
      collection.items.find((i) => i.status === 'ready' && i.manuscript)?.id ??
      collection.items[0]?.id ??
      '';
    setActiveId(next);
  }, [activeId, collection.items]);

  const selectByOffset = useCallback(
    (delta: number) => {
      if (collection.items.length === 0) return;
      const next =
        (activeIndex + delta + collection.items.length) % collection.items.length;
      setActiveId(collection.items[next]!.id);
    },
    [activeIndex, collection.items]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        selectByOffset(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectByOffset(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectByOffset]);

  const canMovePiece = Boolean(active?.manuscript && onMovePiece && !busy);
  const canDeletePiece = Boolean(active && onDeletePiece && !busy);

  return (
    <div className="wv-collection">
      <aside className="wv-collection__nav" aria-label="文章集合">
        <header className="wv-collection__nav-head">
          <div className="wv-collection__nav-title">
            <span className="wv-collection__kicker">探索集合</span>
            <strong title={collection.title || undefined}>
              {collection.title || '多路文稿'}
            </strong>
          </div>
          <div className="wv-collection__count" aria-label={`${readyCount} 篇已就绪`}>
            <b>{readyCount}</b>
            <span>/{collection.items.length} 篇</span>
          </div>
        </header>

        <div className="wv-collection__chips" role="tablist" aria-label="快速切换">
          {collection.items.map((item, idx) => {
            const selected = item.id === active?.id;
            // 优先文风短名；否则截断「标题 · 文风」，不再退化成「第 N 路」
            const short = shortenChipLabel(item.name || item.title || `探索稿 ${idx + 1}`);
            return (
              <button
                key={`chip-${item.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`wv-collection__chip${selected ? ' is-active' : ''}${
                  item.status === 'failed' ? ' is-failed' : ''
                }`}
                onClick={() => setActiveId(item.id)}
                title={item.title}
              >
                <i>{idx + 1}</i>
                <em>{short}</em>
              </button>
            );
          })}
        </div>

        <ul className="wv-collection__list" role="listbox" aria-label="篇目列表">
          {collection.items.map((item, idx) => {
            const selected = item.id === active?.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`wv-collection__item${selected ? ' is-active' : ''}${
                    item.status === 'failed' ? ' is-failed' : ''
                  }`}
                  onClick={() => setActiveId(item.id)}
                >
                  <span className="wv-collection__idx" aria-hidden>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="wv-collection__item-body">
                    {item.name ? (
                      <span className="wv-collection__name">{item.name}</span>
                    ) : null}
                    <b className="wv-collection__item-title">{item.title}</b>
                    {item.angle ? (
                      <small className="wv-collection__angle">{item.angle}</small>
                    ) : null}
                    {item.status === 'failed' ? (
                      <small className="wv-collection__fail">{item.error || '未生成'}</small>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="wv-collection__reader">
        {active ? (
          <div className="wv-collection__reader-meta">
            <span className="wv-collection__reader-pos">
              {activeIndex + 1} / {collection.items.length}
            </span>
            {active.name ? <span className="wv-collection__reader-name">{active.name}</span> : null}
            <div className="wv-collection__reader-actions" role="group" aria-label="本篇操作">
              {onMovePiece ? (
                <button
                  type="button"
                  className="wv-collection__nav-action"
                  disabled={!canMovePiece}
                  onClick={() => {
                    if (active?.manuscript) onMovePiece(active);
                  }}
                  aria-label={t('common.viewer.writing.movePiece')}
                  title={t('common.viewer.writing.movePiece')}
                >
                  <FolderInput size={14} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              {onDeletePiece ? (
                <button
                  type="button"
                  className="wv-collection__nav-action wv-collection__nav-action--danger"
                  disabled={!canDeletePiece}
                  onClick={() => onDeletePiece(active)}
                  aria-label={t('common.viewer.writing.deletePiece')}
                  title={t('common.viewer.writing.deletePiece')}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </div>
            <span className="wv-collection__reader-hint">← → 切换</span>
          </div>
        ) : null}
        {collection.items.length === 0 ? (
          <p className="wv-error">{t('common.viewer.writing.noContent')}</p>
        ) : active?.manuscript ? (
          <DocumentReaderShell variant="immersive">
            <MarkdownReader content={active.manuscript} />
          </DocumentReaderShell>
        ) : (
          <p className="wv-error">{active?.error || '该路文稿尚未生成'}</p>
        )}
      </div>
    </div>
  );
}

function StoryboardChunksView({ chunks }: { chunks: StoryboardChunk[] }) {
  const { t } = useTranslation();
  const summary = useMemo(() => {
    let shotCount = 0;
    let totalSeconds = 0;
    const roleSet = new Set<string>();
    for (const c of chunks) {
      totalSeconds += Number(c.chunk_seconds || 0) || 0;
      const cAny = c as any;
      if (Array.isArray(cAny.characters_in_shot)) {
        for (const r of cAny.characters_in_shot) if (r) roleSet.add(String(r).trim());
      }
      if (Array.isArray(c.shots) && c.shots.length > 0) {
        shotCount += c.shots.length;
        for (const s of c.shots) {
          const sAny = s as any;
          if (Array.isArray(sAny.characters_in_shot)) {
            for (const r of sAny.characters_in_shot) if (r) roleSet.add(String(r).trim());
          }
        }
      } else {
        shotCount += 1;
      }
    }
    return { chunkCount: chunks.length, shotCount, totalSeconds, roles: Array.from(roleSet).filter(Boolean) };
  }, [chunks]);

  return (
    <div className="wv-storyboard">
      <div className="wv-storyboard-summary">
        <div className="wv-summary-title">{t('common.viewer.writing.storyboardSummary')}</div>
        <div className="wv-summary-line">
          {t('common.viewer.writing.storyboardStats', {
            chunks: summary.chunkCount,
            shots: summary.shotCount,
            seconds: Math.round(summary.totalSeconds),
          })}
        </div>
        {summary.roles.length > 0 && (
          <div className="wv-summary-line">{t('common.viewer.writing.roles', { roles: summary.roles.join('、') })}</div>
        )}
      </div>
      {chunks.map((chunk, i) => {
        const hasShots = (chunk.shots?.length ?? 0) > 0;
        const idx = chunk.index ?? i + 1;
        const secs = chunk.chunk_seconds ?? 15;
        return (
          <div key={idx} className="wv-chunk-card">
            <div className="wv-chunk-title">
              {hasShots
                ? t('common.viewer.writing.segmentWithShots', { index: idx, seconds: secs, count: chunk.shots!.length })
                : t('common.viewer.writing.shot', { index: idx, seconds: secs })}
            </div>
            {chunk.shot_timeline?.length && !hasShots && (
              <div className="wv-chunk-meta">
                <span className="wv-meta-label">{t('common.viewer.writing.timeline')}</span>
                {chunk.shot_timeline.map((seg) => `[${seg}]`).join(' ')}
              </div>
            )}
            {hasShots ? (
              <div className="wv-chunk-shots">
                {chunk.shots!.map((shot, si) => (
                  <div key={si} className="wv-shot">
                    <div className="wv-shot-meta">
                      {t('common.viewer.writing.shotIndex', { index: shot.shot_index })}
                      {shot.shot_timeline?.[0] && ` · ${shot.shot_timeline[0]}`}
                    </div>
                    <div className="wv-shot-desc">{shot.video_description || '—'}</div>
                    {shot.dialogue && (
                      <div className="wv-shot-dialogue">
                        {t('common.viewer.writing.dialogue', { text: shot.dialogue })}
                      </div>
                    )}
                    {shot.camera_movement && (
                      <div className="wv-shot-extra">
                        {t('common.viewer.writing.camera', { text: shot.camera_movement })}
                      </div>
                    )}
                    {shot.sound_effects && (
                      <div className="wv-shot-extra">
                        {t('common.viewer.writing.sfx', { text: shot.sound_effects })}
                      </div>
                    )}
                    {shot.transition && (
                      <div className="wv-shot-extra">
                        {t('common.viewer.writing.transition', { text: shot.transition })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {(chunk.video_description ?? '').trim() && (
                  <div className="wv-shot-desc">{chunk.video_description}</div>
                )}
                {chunk.dialogue && (
                  <div className="wv-shot-dialogue">
                    {t('common.viewer.writing.dialogue', { text: chunk.dialogue })}
                  </div>
                )}
                {chunk.camera_movement && (
                  <div className="wv-chunk-meta">
                    <span className="wv-meta-label">{t('common.viewer.writing.cameraLabel')}</span>
                    {chunk.camera_movement}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      <style>{`
        .wv-storyboard { padding: 0.5rem 0; }
        .wv-storyboard-summary {
          padding: 12px;
          margin-bottom: 16px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
        }
        .wv-summary-title { font-weight: 600; font-size: 1rem; color: #e0e0e0; margin-bottom: 6px; }
        .wv-summary-line { font-size: 0.875rem; color: #888; }
        .wv-chunk-card {
          padding: 12px;
          margin-bottom: 12px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
        }
        .wv-chunk-title { font-weight: 600; font-size: 0.95rem; color: #e0e0e0; margin-bottom: 8px; }
        .wv-chunk-meta, .wv-shot-meta { font-size: 0.8rem; color: #888; margin-bottom: 4px; }
        .wv-meta-label { margin-right: 6px; }
        .wv-chunk-shots { margin-top: 8px; }
        .wv-shot {
          padding-left: 12px;
          margin-bottom: 10px;
          border-left: 2px solid hsl(var(--border));
        }
        .wv-shot-desc { font-size: 0.9rem; color: #e0e0e0; margin-bottom: 4px; }
        .wv-shot-dialogue { font-size: 0.85rem; color: #93c5fd; margin-top: 4px; }
        .wv-shot-extra { font-size: 0.8rem; color: #888; margin-top: 2px; }
      `}</style>
    </div>
  );
}

function SunoJsonView({ data }: { data: SunoData }) {
  const { t } = useTranslation();
  return (
    <div className="wv-suno">
      {data.title && (
        <div className="wv-suno-block">
          <div className="wv-suno-label">{t('common.viewer.writing.songTitle')}</div>
          <div className="wv-suno-value">{data.title}</div>
        </div>
      )}
      <div className="wv-suno-block">
        <div className="wv-suno-label">{t('common.viewer.writing.lyrics')}</div>
        <div className="wv-suno-content">{data.prompt}</div>
      </div>
      {(data.tags || data.negative_tags) && (
        <div className="wv-suno-meta">
          {data.tags && (
            <div>
              <div className="wv-suno-label">{t('common.viewer.writing.musicTags')}</div>
              <div className="wv-suno-value">{data.tags}</div>
            </div>
          )}
          {data.negative_tags && (
            <div>
              <div className="wv-suno-label">{t('common.viewer.writing.negativeTags')}</div>
              <div className="wv-suno-value">{data.negative_tags}</div>
            </div>
          )}
        </div>
      )}
      <style>{`
        .wv-suno { padding: 0.5rem 0; }
        .wv-suno-block { margin-bottom: 16px; }
        .wv-suno-label { font-weight: 600; font-size: 0.95rem; color: #aaa; margin-bottom: 4px; }
        .wv-suno-value { font-size: 0.9rem; color: #e0e0e0; }
        .wv-suno-content {
          padding: 12px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          font-size: 0.9rem;
          line-height: 1.6;
          color: hsl(var(--foreground));
          white-space: pre-wrap;
        }
        .wv-suno-meta { margin-top: 12px; }
      `}</style>
    </div>
  );
}

export function WritingViewerModal({
  visible,
  onClose,
  title,
  content,
  pdfPreviewUrl = null,
  pdfHttpHeaders = null,
  pptxPreviewUrl = null,
  task,
  loading = false,
  error = null,
  onRemoveCollectionItem,
}: WritingViewerModalProps) {
  const { t } = useTranslation();
  const { modal, message } = App.useApp();
  const { isAdmin, viewMode, setViewMode } = useAdminGatedViewerMode<'content' | 'raw'>('content');
  const [downloadBusy, setDownloadBusy] = useState<'pdf' | 'markdown' | 'pptx' | null>(null);
  const [pdfControls, setPdfControls] = useState<PdfReaderControls | null>(null);
  const [pieceBusy, setPieceBusy] = useState(false);
  const [moveSession, setMoveSession] = useState<{
    taskIds: string[];
    prepareLinks?: () => Promise<PrepareKnowledgeLinksResult>;
    itemCount: number;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    // 失败任务默认进「数据」，便于立刻看到状态与报错（仅 admin）
    const st = task?.status ?? '';
    if (isAdmin && (st === 'failed' || st === 'cancelled' || st === 'network_error')) {
      setViewMode('raw');
    } else {
      setViewMode('content');
    }
  }, [visible, task?.id, task?.status, isAdmin, setViewMode]);

  const handlePdfControlsChange = useCallback((controls: PdfReaderControls | null) => {
    setPdfControls(controls);
  }, []);

  const { writingType, format } = resolveWritingInfo(task);
  const isStoryboard = writingType === 'storyboard-scripts';
  const isSunoJson = writingType === 'lyrics' && format === 'suno';
  const isPlainText = writingType === 'voice-scripts';
  const taskStatus = task?.status ?? '';
  const isTaskFailed =
    taskStatus === 'failed' || taskStatus === 'cancelled' || taskStatus === 'network_error';
  const isTaskIncomplete =
    !!task &&
    !isTaskFailed &&
    !['completed', 'awaiting_review'].includes(taskStatus) &&
    !content?.trim() &&
    !pdfPreviewUrl &&
    !pptxPreviewUrl;
  const taskError = (task?.progress?.error || '').trim() || null;
  const contentErrorLabel =
    error && /no content found/i.test(error)
      ? t('common.viewer.writing.noContentIncomplete')
      : error;

  const storyboardChunks = useMemo((): StoryboardChunk[] | null => {
    if (!isStoryboard || !content?.trim()) return null;
    try {
      const parsed = JSON.parse(content.trim());
      let raw: unknown[] = Array.isArray(parsed) ? parsed : parsed?.chunks;
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const flat: StoryboardChunk[] = [];
      for (let i = 0; i < raw.length; i++) {
        let item = raw[i] as Record<string, unknown>;
        if (!item || typeof item !== 'object') continue;
        const vd = item.video_description;
        if (typeof vd === 'string' && (vd.trimStart().startsWith('{') || vd.trimStart().startsWith('['))) {
          try {
            const inner = JSON.parse(vd);
            const innerChunks = Array.isArray(inner) ? inner : inner?.chunks;
            if (Array.isArray(innerChunks) && innerChunks.length > 0) {
              item = { ...item, ...innerChunks[0] } as Record<string, unknown>;
            }
          } catch {
            /* ignore */
          }
        }
        const inner = item.chunks;
        if (Array.isArray(inner)) {
          inner.forEach((c: unknown) => flat.push({ ...(c as StoryboardChunk), index: (c as any)?.index ?? flat.length + 1 }));
        } else {
          flat.push({ ...(item as StoryboardChunk), index: (item.index as number) ?? flat.length + 1 });
        }
      }
      return flat.length > 0 ? flat : null;
    } catch {
      return null;
    }
  }, [isStoryboard, content]);

  const sunoData = useMemo((): SunoData | null => {
    if (!isSunoJson || !content) return null;
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed?.prompt && typeof parsed.prompt === 'string') {
        return {
          title: parsed.title,
          prompt: parsed.prompt,
          tags: parsed.tags,
          negative_tags: parsed.negative_tags,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [isSunoJson, content]);

  const deckMeta = useMemo(
    () =>
      task
        ? pickPresentationDeckMeta(task)
        : { isDeck: false as const, teasers: [] as WritingCollectionTeaser[] },
    [task]
  );
  const deckSlides = useMemo(() => readDeckSlidesFromTask(task), [task]);
  const writingCollection = useMemo(() => {
    // 演示文稿不得再进文集视图
    if (deckMeta.isDeck) return null;
    return readWritingCollection(task);
  }, [task, deckMeta.isDeck]);

  const officeEmbedUrl = useMemo(() => {
    // 仅公网 HTTPS 才走 Office Online；本地/内网 MinIO 会白屏
    if (!isPublicHttpsUrl(pptxPreviewUrl)) return null;
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptxPreviewUrl!)}`;
  }, [pptxPreviewUrl]);

  const showPptxViewer = Boolean(deckMeta.isDeck || pptxPreviewUrl);

  const openMoveWhole = useCallback(() => {
    if (!task?.id) return;
    setMoveSession({ taskIds: [task.id], itemCount: 1 });
  }, [task?.id]);

  const openMovePiece = useCallback(
    (item: WritingCollectionItem) => {
      if (!item.manuscript?.trim()) return;
      const parentTaskId = task?.id;
      const manuscript = item.manuscript;
      const pieceTitle = (item.title || item.name || '文稿').trim().slice(0, 120);
      const safeName = (item.title || item.name || 'manuscript')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      const previewSource = (item.textPreview || manuscript).trim();
      const contentPreview = previewSource.slice(0, 1200);
      const taskMeta = (task?.metadata ?? {}) as Record<string, unknown>;
      const taskLabel =
        typeof taskMeta.taskLabel === 'string' && taskMeta.taskLabel.trim()
          ? taskMeta.taskLabel.trim()
          : undefined;
      const subtypeLabel =
        typeof taskMeta.subtypeLabel === 'string' && taskMeta.subtypeLabel.trim()
          ? taskMeta.subtypeLabel.trim()
          : undefined;
      setMoveSession({
        taskIds: [],
        itemCount: 1,
        prepareLinks: async () => {
          const file = new File([manuscript], `${safeName || 'manuscript'}.md`, {
            type: 'text/markdown;charset=utf-8',
          });
          const res = await uploadAssets(file, {
            purpose: 'knowledge',
            storageMode: 'asset',
            taskId: parentTaskId,
            metadata: {
              asset_type: 'writing_manuscript',
              label: pieceTitle,
              contentPreview,
              ...(taskLabel ? { taskLabel } : {}),
              ...(subtypeLabel ? { subtypeLabel } : {}),
              ...(parentTaskId ? { source_task_id: parentTaskId } : {}),
              piece_id: item.id,
            },
          });
          const objectId = res.data?.data?.objectId;
          if (res.error || !objectId) {
            throw new Error(res.error || t('common.task.moveToFolder.failed'));
          }
          return { storageObjectIds: [objectId] };
        },
      });
    },
    [t, task?.id, task?.metadata]
  );

  const handleDeletePiece = useCallback(
    (item: WritingCollectionItem) => {
      if (!onRemoveCollectionItem) return;
      modal.confirm({
        title: t('common.viewer.writing.deletePieceConfirmTitle'),
        content: t('common.viewer.writing.deletePieceConfirmContent', {
          title: item.title || item.name || item.id,
        }),
        okText: t('common.viewer.writing.deletePiece'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: async () => {
          setPieceBusy(true);
          try {
            await onRemoveCollectionItem(item.id);
            message.success(t('common.viewer.writing.deletePieceSuccess'));
          } catch (err) {
            message.error(
              err instanceof Error ? err.message : t('common.viewer.writing.deletePieceFailed')
            );
            throw err;
          } finally {
            setPieceBusy(false);
          }
        },
      });
    },
    [message, modal, onRemoveCollectionItem, t]
  );

  const markdownContent = useMemo(() => {
    if (writingCollection || showPptxViewer) return null;
    if (!content?.trim() || isPlainText || storyboardChunks || sunoData) return null;
    return content.trim();
  }, [content, isPlainText, storyboardChunks, sunoData, writingCollection, showPptxViewer]);

  const renderContent = () => {
    // 演示文稿：公网 URL → Office Online；否则页舞台预览 + 下载 PPTX
    if (showPptxViewer) {
      if (officeEmbedUrl) {
        return (
          <div className="wv-pptx-frame-wrap">
            <iframe
              className="wv-pptx-frame"
              title={title || '演示文稿'}
              src={officeEmbedUrl}
              allowFullScreen
            />
          </div>
        );
      }
      return (
        <PptxDeckReader
          slides={
            deckSlides.length > 0
              ? deckSlides
              : deckMeta.teasers.map((t) => ({
                  id: t.id,
                  title: t.title || t.name || '幻灯片',
                  subtitle: t.angle,
                  bodyMarkdown: t.textPreview,
                }))
          }
          slideCount={deckMeta.slideCount}
          sourceUrl={pptxPreviewUrl}
          onDownload={task?.id ? () => void handleDownload('pptx') : undefined}
          downloadBusy={downloadBusy === 'pptx'}
        />
      );
    }
    // 文集 / 结构化稿优先于 PDF，避免 sidecar 盖住专用视图
    if (writingCollection) {
      return (
        <WritingCollectionView
          key={task?.id ?? writingCollection.title ?? 'collection'}
          collection={writingCollection}
          onMovePiece={openMovePiece}
          onDeletePiece={onRemoveCollectionItem ? handleDeletePiece : undefined}
          busy={pieceBusy}
        />
      );
    }
    if (storyboardChunks) {
      return <StoryboardChunksView chunks={storyboardChunks} />;
    }
    if (sunoData) {
      return <SunoJsonView data={sunoData} />;
    }
    if (pdfPreviewUrl) {
      return (
        <DocumentReaderShell variant="immersive">
          <PdfJsReader
            source={pdfPreviewUrl}
            httpHeaders={pdfHttpHeaders ?? undefined}
            showInlineToolbar={false}
            onControlsChange={handlePdfControlsChange}
          />
        </DocumentReaderShell>
      );
    }
    if (isPlainText) {
      return (
        <DocumentReaderShell variant="immersive">
          <PlainTextReader content={content || t('common.viewer.writing.noContent')} />
        </DocumentReaderShell>
      );
    }
    if (markdownContent) {
      return (
        <DocumentReaderShell variant="immersive">
          <MarkdownReader content={markdownContent} />
        </DocumentReaderShell>
      );
    }
    return (
      <DocumentReaderShell variant="immersive">
        <PlainTextReader content={content || t('common.viewer.writing.noContentIncomplete')} />
      </DocumentReaderShell>
    );
  };

  const handleDownload = async (format: 'pdf' | 'markdown' | 'pptx') => {
    const taskId = task?.id;
    if (!taskId || downloadBusy || loading || error) return;
    setDownloadBusy(format);
    try {
      await downloadWritingExport(taskId, format);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('common.viewer.downloadFailedGeneric'));
    } finally {
      setDownloadBusy(null);
    }
  };

  if (!visible) return null;

  const hasReadableContent = Boolean(
    pdfPreviewUrl || pptxPreviewUrl || showPptxViewer || content?.trim()
  );
  const showDownloads = Boolean(task?.id && !loading && !error && hasReadableContent);
  const hasPptx = Boolean(
    showPptxViewer ||
      task?.metadata?.presentationStorage ||
      task?.result?.metadata?.presentationStorage ||
      task?.metadata?.presentationRenderStatus === 'ok' ||
      task?.result?.metadata?.presentationRenderStatus === 'ok'
  );

  const showPdfToolbar =
    Boolean(pdfPreviewUrl && viewMode === 'content' && pdfControls && !loading && !error);

  const bodyScrollClass =
    !loading &&
    viewMode === 'content' &&
    !pdfPreviewUrl &&
    !showPptxViewer &&
    !writingCollection
      ? 'wv-body wv-body--edge-scroll'
      : 'wv-body wv-body--contained';

  return (
    <div
      className="wv-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wv-title"
    >
      <div className="wv-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="wv-shell">
        <MediaViewerHeader
          title={title || t('common.viewer.writing.title')}
          titleId="wv-title"
          tabs={[
            { value: 'content', label: t('common.viewer.tabs.content') },
            { value: 'raw', label: t('common.viewer.tabs.data') },
          ]}
          activeTab={viewMode}
          onTabChange={(tab) => setViewMode(tab as 'content' | 'raw')}
          onClose={onClose}
        >
          {showPdfToolbar && pdfControls ? (
            <>
              <MediaViewerHeaderDivider />
              <ReaderToolbar
                variant="compact"
                className="mvh-pdf-toolbar"
                zoom={pdfControls.zoom}
                onZoomIn={pdfControls.onZoomIn}
                onZoomOut={pdfControls.onZoomOut}
                onFitWidth={pdfControls.onFitWidth}
                fitWidthActive={pdfControls.fitWidthActive}
                currentPage={pdfControls.currentPage}
                totalPages={pdfControls.totalPages}
                onPrevPage={pdfControls.onPrevPage}
                onNextPage={pdfControls.onNextPage}
                canPrevPage={pdfControls.canPrevPage}
                canNextPage={pdfControls.canNextPage}
              />
            </>
          ) : null}

          {showDownloads ? (
            <>
              <MediaViewerHeaderDivider />
              <MediaViewerHeaderIconButton
                disabled={!!downloadBusy}
                onClick={() => void handleDownload('markdown')}
                aria-label={t('common.viewer.writing.downloadMarkdown')}
                title={
                  downloadBusy === 'markdown'
                    ? t('common.viewer.downloading')
                    : t('common.viewer.writing.downloadMarkdown')
                }
              >
                <FileText size={15} strokeWidth={2} />
              </MediaViewerHeaderIconButton>
              <MediaViewerHeaderIconButton
                disabled={!!downloadBusy}
                onClick={() => void handleDownload('pdf')}
                aria-label={t('common.viewer.writing.downloadPdf')}
                title={
                  downloadBusy === 'pdf'
                    ? t('common.viewer.downloading')
                    : t('common.viewer.writing.downloadPdf')
                }
              >
                <FileDown size={15} strokeWidth={2} />
              </MediaViewerHeaderIconButton>
              {hasPptx ? (
                <MediaViewerHeaderIconButton
                  disabled={!!downloadBusy}
                  onClick={() => void handleDownload('pptx')}
                  aria-label="下载 PPTX"
                  title={downloadBusy === 'pptx' ? t('common.viewer.downloading') : '下载 PPTX'}
                >
                  <Presentation size={15} strokeWidth={2} />
                </MediaViewerHeaderIconButton>
              ) : null}
            </>
          ) : null}

          {task?.id && !loading && !error ? (
            <>
              <MediaViewerHeaderDivider />
              <MediaViewerHeaderIconButton
                onClick={openMoveWhole}
                aria-label={
                  writingCollection
                    ? t('common.viewer.writing.moveCollection')
                    : t('common.task.actions.moveToFolder')
                }
                title={
                  writingCollection
                    ? t('common.viewer.writing.moveCollection')
                    : t('common.task.actions.moveToFolder')
                }
              >
                <FolderInput size={15} strokeWidth={2} />
              </MediaViewerHeaderIconButton>
            </>
          ) : null}
        </MediaViewerHeader>

        <main className={bodyScrollClass}>
          {loading ? (
            <div className="media-viewer-loading-wrap writing-viewer-loading-wrap">
              <MediaLoadingState variant="inline" kind="writing" />
            </div>
          ) : viewMode === 'raw' ? (
            <div className="wv-body-inner wv-body-inner--data">
              <TaskViewerDataPanel task={task} />
            </div>
          ) : (
            <div
              className={`wv-body-inner${
                pdfPreviewUrl
                  ? ' wv-body-inner--pdf'
                  : showPptxViewer
                    ? ' wv-body-inner--pptx'
                    : writingCollection
                      ? ' wv-body-inner--collection'
                      : ''
              }`}
            >
              {isTaskFailed && task ? (
                <div className="wv-progress-wrap">
                  <TaskProgressStage
                    progress={task.progress?.progress ?? null}
                    status={task.status}
                    statusLabel={getTaskStatusLabel(task.status, t)}
                    kind="writing"
                    error={taskError || contentErrorLabel || t('common.task.status.failed')}
                  />
                </div>
              ) : isTaskIncomplete && task ? (
                <div className="wv-progress-wrap">
                  <TaskProgressStage
                    progress={task.progress?.progress ?? null}
                    status={task.status}
                    statusLabel={
                      task.progress?.message?.trim() || getTaskStatusLabel(task.status, t)
                    }
                    kind="writing"
                  />
                </div>
              ) : contentErrorLabel && !hasReadableContent ? (
                <p className="wv-error">{contentErrorLabel}</p>
              ) : (
                renderContent()
              )}
            </div>
          )}
        </main>
      </div>

      {moveSession ? (
        <MoveTasksToKnowledgeFolderModal
          open
          taskIds={moveSession.taskIds}
          prepareLinks={moveSession.prepareLinks}
          itemCount={moveSession.itemCount}
          onClose={() => setMoveSession(null)}
        />
      ) : null}
    </div>
  );
}
