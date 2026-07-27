import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getKnowledgeFolderIndexStatus,
  triggerKnowledgeFolderParse,
  type FolderCardTag,
} from '../api/client';
import {
  ParseProgressDock,
  type ParseProgressPhase,
  type ParseTerminal,
} from '../components/knowledge-base/ParseProgressDock';

export type VfParseProgress = {
  phase: ParseProgressPhase;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  lastUpdate: number;
};

export type VfParseJob = {
  folderId: string;
  folderName: string;
  cardTag: FolderCardTag | '';
  open: boolean;
  terminal: ParseTerminal;
  progress: VfParseProgress | null;
  error: string | null;
  /** 终态完成时间戳，供 KnowledgeBase 刷新列表 */
  finishedAt: number | null;
};

type StartParseInput = {
  folderId: string;
  folderName: string;
  cardTag: FolderCardTag | '';
};

type KnowledgeBaseParseContextValue = {
  job: VfParseJob | null;
  /** 当前是否有进行中的解析 */
  isParsing: boolean;
  startParse: (input: StartParseInput) => Promise<void>;
  closeDock: () => void;
  dismissError: () => void;
  retryParse: () => void;
  /** 「查看解析数据」：标记待跳转，由 App 切页 + KnowledgeBase 消费 */
  requestViewResult: () => void;
  /** 待打开详情的 folderId；KnowledgeBase 消费后 clear */
  pendingViewFolderId: string | null;
  clearPendingView: () => void;
};

const KnowledgeBaseParseContext = createContext<KnowledgeBaseParseContextValue | null>(null);

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ROUNDS = 90; // 约 3 分钟，切路由后仍继续

export function KnowledgeBaseParseProvider({
  children,
  onNavigateToKnowledgeBase,
}: {
  children: ReactNode;
  /** 点击「查看解析数据」时切到知识库页 */
  onNavigateToKnowledgeBase?: () => void;
}) {
  const [job, setJob] = useState<VfParseJob | null>(null);
  const [pendingViewFolderId, setPendingViewFolderId] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const lastStartRef = useRef<StartParseInput | null>(null);

  const closeDock = useCallback(() => {
    setJob((prev) => (prev ? { ...prev, open: false } : null));
  }, []);

  const dismissError = useCallback(() => {
    setJob((prev) => (prev ? { ...prev, open: false, error: null } : null));
  }, []);

  const clearPendingView = useCallback(() => {
    setPendingViewFolderId(null);
  }, []);

  const requestViewResult = useCallback(() => {
    setJob((prev) => {
      if (prev?.folderId) setPendingViewFolderId(prev.folderId);
      return prev ? { ...prev, open: false } : null;
    });
    onNavigateToKnowledgeBase?.();
  }, [onNavigateToKnowledgeBase]);

  const startParse = useCallback(async (input: StartParseInput) => {
    lastStartRef.current = input;
    const runId = ++runIdRef.current;

    setJob({
      folderId: input.folderId,
      folderName: input.folderName,
      cardTag: input.cardTag,
      open: true,
      terminal: 'running',
      progress: {
        phase: 'queued',
        total: 0,
        done: 0,
        failed: 0,
        skipped: 0,
        lastUpdate: Date.now(),
      },
      error: null,
      finishedAt: null,
    });

    try {
      const res = await triggerKnowledgeFolderParse(input.folderId, true);
      if (runId !== runIdRef.current) return;
      if (res.error) {
        setJob((prev) =>
          prev && prev.folderId === input.folderId
            ? {
                ...prev,
                terminal: 'error',
                error: res.error ?? '触发解析失败',
                finishedAt: Date.now(),
              }
            : prev
        );
        return;
      }

      let lastCardStatus: string | null = null;

      for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (runId !== runIdRef.current) return;

        const st = await getKnowledgeFolderIndexStatus(input.folderId);
        if (runId !== runIdRef.current) return;

        const body = (st.data as { data?: Record<string, unknown> } | undefined)?.data;
        if (!body) continue;

        lastCardStatus = (body.card_status as string | undefined) ?? null;
        const indexStatus = (body.index_status as string | undefined) ?? null;
        const entries = Array.isArray(body.entries)
          ? (body.entries as Array<Record<string, unknown>>)
          : [];
        const total = entries.length;
        const done = entries.filter((e) => e.status === 'indexed').length;
        const failed = entries.filter((e) => e.status === 'failed').length;
        const skipped = entries.filter((e) => e.status === 'skipped').length;

        const phase: ParseProgressPhase =
          total === 0
            ? i === 0
              ? 'queued'
              : 'resolving'
            : done + failed + skipped < total
              ? 'analyzing'
              : 'summarizing';

        const indexError =
          typeof body.index_error === 'string' ? (body.index_error as string) : null;

        setJob((prev) =>
          prev && prev.folderId === input.folderId
            ? {
                ...prev,
                progress: {
                  phase,
                  total,
                  done,
                  failed,
                  skipped,
                  lastUpdate: Date.now(),
                },
                error: lastCardStatus === 'failed' ? indexError ?? prev.error : prev.error,
                cardTag:
                  ((body.card_tag as FolderCardTag | null | undefined) ?? prev.cardTag) ||
                  prev.cardTag,
              }
            : prev
        );

        if (lastCardStatus === 'ready') break;
        if (lastCardStatus === 'failed') break;
        if (lastCardStatus && lastCardStatus !== 'parsing' && lastCardStatus !== 'idle') break;
        if (indexStatus === 'indexed' && total > 0 && done + failed + skipped >= total) break;
      }

      if (runId !== runIdRef.current) return;

      setJob((prev) => {
        if (!prev || prev.folderId !== input.folderId) return prev;
        if (lastCardStatus === 'ready') {
          return { ...prev, terminal: 'success', finishedAt: Date.now() };
        }
        if (lastCardStatus === 'failed') {
          return {
            ...prev,
            terminal: 'error',
            error: prev.error ?? '解析失败，请稍后重试',
            finishedAt: Date.now(),
          };
        }
        return { ...prev, terminal: 'timeout', finishedAt: Date.now() };
      });
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setJob((prev) =>
        prev && prev.folderId === input.folderId
          ? {
              ...prev,
              terminal: 'error',
              error: e instanceof Error ? e.message : String(e),
              finishedAt: Date.now(),
            }
          : prev
      );
    }
  }, []);

  const retryParse = useCallback(() => {
    const last = lastStartRef.current;
    if (!last) return;
    void startParse(last);
  }, [startParse]);

  const value = useMemo<KnowledgeBaseParseContextValue>(
    () => ({
      job,
      isParsing: job?.terminal === 'running',
      startParse,
      closeDock,
      dismissError,
      retryParse,
      requestViewResult,
      pendingViewFolderId,
      clearPendingView,
    }),
    [
      job,
      startParse,
      closeDock,
      dismissError,
      retryParse,
      requestViewResult,
      pendingViewFolderId,
      clearPendingView,
    ]
  );

  return (
    <KnowledgeBaseParseContext.Provider value={value}>
      {children}
      <ParseProgressDock
        open={!!job?.open}
        terminal={job?.terminal ?? 'running'}
        progress={job?.progress ?? null}
        error={job?.error ?? null}
        folderName={job?.folderName ?? ''}
        cardTag={job?.cardTag ?? ''}
        onClose={closeDock}
        onRetry={retryParse}
        onViewResult={requestViewResult}
        onDismissError={dismissError}
      />
    </KnowledgeBaseParseContext.Provider>
  );
}

export function useKnowledgeBaseParse() {
  const ctx = useContext(KnowledgeBaseParseContext);
  if (!ctx) {
    throw new Error('useKnowledgeBaseParse must be used within KnowledgeBaseParseProvider');
  }
  return ctx;
}
