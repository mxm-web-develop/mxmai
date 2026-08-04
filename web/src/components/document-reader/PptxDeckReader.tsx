import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Presentation } from 'lucide-react';
import { MarkdownReader } from './MarkdownReader';
import './DocumentReader.css';

export type PptxDeckSlide = {
  id: string;
  title: string;
  subtitle?: string;
  bodyMarkdown?: string;
};

type PptxDeckReaderProps = {
  slides: PptxDeckSlide[];
  slideCount?: number;
  /** 鉴权媒体 URL：下载 / 后续真 PPTX 预览 */
  sourceUrl?: string | null;
  httpHeaders?: Record<string, string> | null;
  onDownload?: () => void;
  downloadBusy?: boolean;
};

/**
 * 演示文稿阅读器：用结构化页内容做 16:9 舞台预览。
 * 浏览器无法原生渲染 PPTX；Office Online 又拉不到私有 MinIO，因此以页大纲舞台为主，
 * 下载仍走鉴权 PPTX。
 */
export function PptxDeckReader({
  slides,
  slideCount,
  onDownload,
  downloadBusy,
}: PptxDeckReaderProps) {
  const pages = useMemo(() => {
    if (slides.length > 0) return slides;
    const n = Math.max(1, slideCount ?? 1);
    return Array.from({ length: n }, (_, i) => ({
      id: `s${i + 1}`,
      title: `第 ${i + 1} 页`,
    }));
  }, [slides, slideCount]);

  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, pages.length - 1);
  const current = pages[safeIndex] ?? pages[0]!;

  useEffect(() => {
    setIndex(0);
  }, [pages.map((p) => p.id).join('|')]);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + pages.length) % pages.length);
    },
    [pages.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <div className="pptx-deck-reader">
      <div className="pptx-deck-reader__toolbar">
        <span className="pptx-deck-reader__brand">
          <Presentation size={16} strokeWidth={2} aria-hidden />
          演示文稿
        </span>
        <span className="pptx-deck-reader__pager">
          {safeIndex + 1} / {pages.length}
        </span>
        <div className="pptx-deck-reader__nav">
          <button type="button" onClick={() => go(-1)} aria-label="上一页">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="下一页">
            <ChevronRight size={18} />
          </button>
        </div>
        {onDownload ? (
          <button
            type="button"
            className="pptx-deck-reader__dl"
            disabled={downloadBusy}
            onClick={onDownload}
          >
            {downloadBusy ? '下载中…' : '下载 PPTX'}
          </button>
        ) : null}
      </div>

      <div className="pptx-deck-reader__stage-wrap">
        <article className="pptx-deck-reader__stage" aria-label={current.title}>
          <header className="pptx-deck-reader__stage-head">
            <strong>{current.title}</strong>
            {current.subtitle ? <p>{current.subtitle}</p> : null}
          </header>
          <div className="pptx-deck-reader__stage-body">
            {current.bodyMarkdown?.trim() ? (
              <MarkdownReader content={current.bodyMarkdown.trim()} />
            ) : (
              <p className="pptx-deck-reader__empty">本页内容已写入 PPTX，可下载查看完整版式。</p>
            )}
          </div>
        </article>
      </div>

      {pages.length > 1 ? (
        <ol className="pptx-deck-reader__thumbs">
          {pages.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={i === safeIndex ? 'is-active' : undefined}
                onClick={() => setIndex(i)}
                title={s.title}
              >
                <em>{String(i + 1).padStart(2, '0')}</em>
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
