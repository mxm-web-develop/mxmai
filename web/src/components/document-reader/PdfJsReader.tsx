import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  clampPdfZoom,
  loadPdfDocument,
  PDF_ZOOM_STEP,
  renderPdfPageToCanvas,
  type PdfDocumentSource,
} from '../../lib/pdfjs';
import { ReaderToolbar } from './ReaderToolbar';
import type { PdfReaderControls } from './pdfReaderControls';

const PDF_PAGE_MAX_WIDTH = 960;

interface PdfJsReaderProps {
  source: PdfDocumentSource;
  /** 鉴权 Range 加载（写作 /media/writing 等） */
  httpHeaders?: Record<string, string>;
  /** 默认 true；弹窗顶栏已挂载工具条时设为 false */
  showInlineToolbar?: boolean;
  onControlsChange?: (controls: PdfReaderControls | null) => void;
}

interface PdfPageSlotProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  contentWidth: number;
  zoom: number;
  aspectRatio: number;
  scrollRoot: HTMLElement | null;
  onPageVisible: (pageNumber: number, ratio: number) => void;
  onPageLayout: (pageNumber: number, aspectRatio: number) => void;
}

function PdfPageSlot({
  doc,
  pageNumber,
  contentWidth,
  zoom,
  aspectRatio,
  scrollRoot,
  onPageVisible,
  onPageLayout,
}: PdfPageSlotProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderGenRef = useRef(0);

  const [nearViewport, setNearViewport] = useState(pageNumber === 1);
  const [rendered, setRendered] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [displayHeight, setDisplayHeight] = useState<number | null>(null);

  const placeholderWidth =
    contentWidth > 0 ? Math.round(contentWidth * zoom) : Math.round(420 * zoom);
  const placeholderHeight =
    displayHeight ??
    (contentWidth > 0
      ? Math.round(contentWidth * aspectRatio * zoom)
      : Math.round(420 * aspectRatio * zoom));

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNearViewport(true);
            onPageVisible(pageNumber, entry.intersectionRatio);
          }
        }
      },
      { root: scrollRoot, rootMargin: '400px 0px', threshold: [0, 0.12, 0.4] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onPageVisible, pageNumber, scrollRoot]);

  useLayoutEffect(() => {
    if (!nearViewport || contentWidth <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const gen = ++renderGenRef.current;
    setRendering(true);

    const render = async () => {
      try {
        renderTaskRef.current?.cancel();
        const page = await doc.getPage(pageNumber);
        if (cancelled || gen !== renderGenRef.current) return;

        const { displayWidth, displayHeight: height } = await renderPdfPageToCanvas(
          page,
          canvas,
          contentWidth,
          zoom,
          (task) => {
            renderTaskRef.current = task;
          },
        );

        if (!cancelled && gen === renderGenRef.current) {
          setDisplayHeight(height);
          if (displayWidth > 0) {
            onPageLayout(pageNumber, height / displayWidth);
          }
          setRendered(true);
          setRendering(false);
        }
      } catch (e) {
        if (!cancelled && gen === renderGenRef.current) {
          setRendering(false);
          if (!(e instanceof Error && e.message?.includes('cancel'))) {
            console.warn(`[PdfJsReader] 渲染第 ${pageNumber} 页失败`, e);
          }
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [nearViewport, contentWidth, doc, onPageLayout, pageNumber, zoom]);

  return (
    <div
      ref={shellRef}
      className="doc-reader-pdf-page"
      data-page={pageNumber}
      style={{ width: `${placeholderWidth}px` }}
    >
      {nearViewport ? (
        <div className="doc-reader-pdf-page__frame" style={{ width: `${placeholderWidth}px` }}>
          {rendering && !rendered ? (
            <div
              className="doc-reader-pdf-page__skeleton"
              style={{ width: `${placeholderWidth}px`, height: `${placeholderHeight}px` }}
              aria-hidden
            >
              <span className="doc-reader-pdf-page__skeleton-label">第 {pageNumber} 页</span>
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            className="doc-reader-pdf-page__canvas"
            style={{ display: rendered ? 'block' : 'none' }}
            aria-label={`PDF 第 ${pageNumber} 页`}
          />
        </div>
      ) : (
        <div
          className="doc-reader-pdf-page__ghost"
          style={{ width: `${placeholderWidth}px`, height: `${placeholderHeight}px` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function PdfJsReader({
  source,
  httpHeaders,
  showInlineToolbar = true,
  onControlsChange,
}: PdfJsReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageAspectsRef = useRef<Map<number, number>>(new Map());
  const visibleRatiosRef = useRef<Map<number, number>>(new Map());

  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageAspects, setPageAspects] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const prevZoomRef = useRef(1);

  const contentWidth =
    containerWidth > 0 ? Math.min(containerWidth, PDF_PAGE_MAX_WIDTH) : 0;

  const scrollRefCallback = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScrollRoot(el);
  }, []);

  /** 缩放时保持视口中心对准同一内容点（居中放大） */
  useLayoutEffect(() => {
    const root = scrollRef.current;
    const prevZoom = prevZoomRef.current;
    if (!root || prevZoom === zoom || prevZoom <= 0) {
      prevZoomRef.current = zoom;
      return;
    }

    const ratio = zoom / prevZoom;
    const nextLeft = (root.scrollLeft + root.clientWidth / 2) * ratio - root.clientWidth / 2;
    const nextTop = (root.scrollTop + root.clientHeight / 2) * ratio - root.clientHeight / 2;
    prevZoomRef.current = zoom;

    // 等页面宽度按 zoom 更新后再滚，避免拿旧 scrollWidth
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = Math.max(0, nextLeft);
      el.scrollTop = Math.max(0, nextTop);
    });
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    setNumPages(0);
    setCurrentPage(1);
    setPageAspects(new Map());
    pageAspectsRef.current.clear();
    visibleRatiosRef.current.clear();

    void loadPdfDocument(source, httpHeaders ? { httpHeaders } : undefined)
      .then(async (loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        setNumPages(loaded.numPages);

        const map = new Map<number, number>();
        for (let i = 1; i <= loaded.numPages; i += 1) {
          const page = await loaded.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          if (vp.width > 0) map.set(i, vp.height / vp.width);
        }
        if (!cancelled) {
          pageAspectsRef.current = map;
          setPageAspects(map);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'PDF 加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // httpHeaders 用序列化键避免对象引用抖动
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headersKey 代理 httpHeaders
  }, [source, httpHeaders ? JSON.stringify(httpHeaders) : '']);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      const styles = getComputedStyle(el);
      const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const w = el.clientWidth - padX;
      if (w > 0) setContainerWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, numPages]);

  const handlePageLayout = useCallback((pageNumber: number, aspectRatio: number) => {
    const prev = pageAspectsRef.current.get(pageNumber);
    if (prev && Math.abs(prev - aspectRatio) < 0.001) return;
    pageAspectsRef.current.set(pageNumber, aspectRatio);
    setPageAspects(new Map(pageAspectsRef.current));
  }, []);

  const syncCurrentPageFromScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const anchor = rootRect.top + rootRect.height * 0.35;
    const pages = root.querySelectorAll<HTMLElement>('[data-page]');

    let bestPage = 1;
    let bestDist = Infinity;

    pages.forEach((node) => {
      const pageNum = Number(node.dataset.page);
      if (!pageNum) return;
      const rect = node.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height * 0.25 - anchor);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = pageNum;
      }
    });

    setCurrentPage(bestPage);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncCurrentPageFromScroll);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [syncCurrentPageFromScroll, numPages, scrollRoot]);

  const handlePageVisible = useCallback((pageNumber: number, ratio: number) => {
    visibleRatiosRef.current.set(pageNumber, ratio);

    let bestPage = pageNumber;
    let bestRatio = ratio;
    visibleRatiosRef.current.forEach((r, p) => {
      if (r > bestRatio) {
        bestRatio = r;
        bestPage = p;
      }
    });
    if (bestRatio > 0.05) setCurrentPage(bestPage);
  }, []);

  const scrollToPage = useCallback((page: number) => {
    const root = scrollRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-page="${page}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }, []);

  const handlePrevPage = useCallback(() => {
    scrollToPage(Math.max(1, currentPage - 1));
  }, [currentPage, scrollToPage]);

  const handleNextPage = useCallback(() => {
    scrollToPage(Math.min(numPages, currentPage + 1));
  }, [currentPage, numPages, scrollToPage]);

  const handleZoomIn = useCallback(() => {
    setFitWidth(false);
    setZoom((z) => clampPdfZoom(z + PDF_ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitWidth(false);
    setZoom((z) => clampPdfZoom(z - PDF_ZOOM_STEP));
  }, []);

  const handleFitWidth = useCallback(() => {
    setFitWidth(true);
    setZoom(1);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    });
  }, []);

  useEffect(() => {
    if (!onControlsChange) return;
    if (loading || error || !doc || numPages === 0) {
      onControlsChange(null);
      return;
    }
    onControlsChange({
      zoom,
      fitWidthActive: fitWidth,
      currentPage,
      totalPages: numPages,
      canPrevPage: currentPage > 1,
      canNextPage: currentPage < numPages,
      onZoomIn: handleZoomIn,
      onZoomOut: handleZoomOut,
      onFitWidth: handleFitWidth,
      onPrevPage: handlePrevPage,
      onNextPage: handleNextPage,
    });
  }, [
    onControlsChange,
    loading,
    error,
    doc,
    numPages,
    zoom,
    fitWidth,
    currentPage,
    handleZoomIn,
    handleZoomOut,
    handleFitWidth,
    handlePrevPage,
    handleNextPage,
  ]);

  useEffect(() => {
    return () => onControlsChange?.(null);
  }, [onControlsChange, source]);

  if (loading) {
    return <div className="doc-reader-pdf-loading">正在加载 PDF…</div>;
  }

  if (error || !doc) {
    return <div className="doc-reader-pdf-error">{error ?? 'PDF 加载失败'}</div>;
  }

  const canPrev = currentPage > 1;
  const canNext = currentPage < numPages;
  const defaultAspect = pageAspects.get(1) ?? 1.414;

  return (
    <div className="doc-reader-pdf">
      {showInlineToolbar ? (
        <ReaderToolbar
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitWidth={handleFitWidth}
          fitWidthActive={fitWidth}
          currentPage={currentPage}
          totalPages={numPages}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          canPrevPage={canPrev}
          canNextPage={canNext}
        />
      ) : null}
      <div ref={scrollRefCallback} className="doc-reader-pdf-scroll">
        {Array.from({ length: numPages }, (_, i) => {
          const pageNumber = i + 1;
          const aspect = pageAspects.get(pageNumber) ?? defaultAspect;
          return (
            <PdfPageSlot
              key={pageNumber}
              doc={doc}
              pageNumber={pageNumber}
              contentWidth={contentWidth}
              zoom={zoom}
              aspectRatio={aspect}
              scrollRoot={scrollRoot}
              onPageVisible={handlePageVisible}
              onPageLayout={handlePageLayout}
            />
          );
        })}
      </div>
    </div>
  );
}
