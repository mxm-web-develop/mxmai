import { useEffect, useState } from 'react';
import { Button, Progress, Space, Steps, Tag } from 'antd';
import type { FolderCardTag } from '../../api/client';

export type ParseProgressPhase = 'queued' | 'resolving' | 'analyzing' | 'summarizing';
export type ParseTerminal = 'running' | 'success' | 'error' | 'timeout';

const CARD_TAG_LABEL: Record<FolderCardTag, string> = {
  style: '视觉风格',
  writing: '语感文风',
  character: '角色卡',
  knowledge: '知识卡',
};

export type ParseProgressDockProps = {
  open: boolean;
  terminal: ParseTerminal;
  progress: {
    phase: ParseProgressPhase;
    total: number;
    done: number;
    failed: number;
    skipped: number;
    lastUpdate: number;
  } | null;
  error: string | null;
  folderName: string;
  cardTag: FolderCardTag | '';
  onClose: () => void;
  onRetry: () => void;
  onViewResult: () => void;
  onDismissError: () => void;
};

/** 应用级右下角可收起挂窗：不挡操作，切路由也保留 */
export function ParseProgressDock({
  open,
  terminal,
  progress,
  error,
  folderName,
  cardTag,
  onClose,
  onRetry,
  onViewResult,
  onDismissError,
}: ParseProgressDockProps) {
  const [expanded, setExpanded] = useState(true);
  const isRunning = terminal === 'running';
  const isSuccess = terminal === 'success';
  const isError = terminal === 'error';
  const isTimeout = terminal === 'timeout';

  useEffect(() => {
    if (open && isRunning) setExpanded(true);
  }, [open, isRunning]);

  if (!open) return null;

  const stepIndex: number = (() => {
    if (isSuccess) return 3;
    if (isError || isTimeout) return progress && progress.total > 0 ? 2 : 1;
    if (!progress) return 0;
    if (progress.phase === 'queued') return 0;
    if (progress.phase === 'resolving') return 1;
    if (progress.phase === 'analyzing') {
      if (progress.total === 0) return 1;
      return progress.done + progress.failed + progress.skipped < progress.total ? 1 : 2;
    }
    return 2;
  })();

  const phaseLabel: Record<ParseProgressPhase, string> = {
    queued: '排队中',
    resolving: '解析参考条目',
    analyzing: '逐条分析中',
    summarizing: '汇总卡摘要',
  };

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const failed = progress?.failed ?? 0;
  const skipped = progress?.skipped ?? 0;
  const finished = total > 0 ? done + failed + skipped : 0;
  const percent =
    total > 0 ? Math.min(100, Math.round((finished / total) * 100)) : isSuccess ? 100 : 8;

  const tagLabel = cardTag ? CARD_TAG_LABEL[cardTag] ?? cardTag : '普通管理';

  const titleText = isSuccess
    ? '解析完成'
    : isError
      ? '解析失败'
      : isTimeout
        ? '解析超时'
        : '正在解析…';

  const statusColor = isSuccess
    ? '#10b981'
    : isError
      ? '#ef4444'
      : isTimeout
        ? '#f59e0b'
        : '#0ea5e9';

  return (
    <div
      className="vf-parse-dock"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 1100,
        width: expanded ? 380 : 280,
        maxWidth: 'calc(100vw - 32px)',
        borderRadius: 12,
        border: '1px solid rgba(148,163,184,0.28)',
        background: 'var(--bg-elevated, #fff)',
        boxShadow: '0 12px 40px rgba(15,23,42,0.16), 0 2px 8px rgba(15,23,42,0.06)',
        overflow: 'hidden',
        transition: 'width 180ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: expanded ? '1px solid rgba(148,163,184,0.16)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? '收起解析进度' : '展开解析进度'}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            boxShadow: isRunning ? `0 0 0 3px ${statusColor}33` : undefined,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {titleText}
            {folderName ? (
              <span className="muted" style={{ fontWeight: 400, marginInlineStart: 6 }}>
                · {folderName}
              </span>
            ) : null}
          </div>
          {!expanded ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {isRunning
                ? total > 0
                  ? `${finished}/${total} · ${percent}%`
                  : phaseLabel[progress?.phase ?? 'queued']
                : tagLabel}
            </div>
          ) : null}
        </div>
        {isRunning && !expanded ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: statusColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percent}%
          </span>
        ) : null}
        <Button
          type="text"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-label={expanded ? '收起' : '展开'}
          style={{ color: 'var(--text-muted, #64748b)' }}
        >
          {expanded ? '收起' : '展开'}
        </Button>
        {!isRunning ? (
          <Button
            type="text"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (isError) onDismissError();
              else onClose();
            }}
            aria-label="关闭"
            style={{ color: 'var(--text-muted, #64748b)' }}
          >
            ✕
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div style={{ padding: '12px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Tag
              color={cardTag === 'character' ? 'purple' : cardTag === 'style' ? 'blue' : 'default'}
              style={{ marginInlineStart: 0 }}
            >
              {tagLabel}
            </Tag>
            {isRunning ? (
              <span className="muted" style={{ fontSize: 12 }}>
                可收起后继续其它操作
              </span>
            ) : null}
          </div>

          <Steps
            size="small"
            current={stepIndex}
            items={[{ title: '提交' }, { title: '分析' }, { title: '汇总' }]}
          />

          {isRunning ? (
            <div style={{ marginTop: 14 }}>
              <Progress
                percent={percent}
                size="small"
                strokeColor={{ from: '#0ea5e9', to: '#38bdf8' }}
                format={(p) => (
                  <span style={{ fontSize: 11 }}>{total > 0 ? `${finished}/${total}` : `${p}%`}</span>
                )}
              />
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {progress ? phaseLabel[progress.phase] : '准备中…'}
                {total > 0 ? (
                  <span className="muted" style={{ marginInlineStart: 6 }}>
                    成功 {done} · 失败 {failed} · 跳过 {skipped}
                  </span>
                ) : null}
              </div>
            </div>
          ) : isSuccess ? (
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
              共 {total} 条，成功 {done}
              {failed > 0 ? ` · 失败 ${failed}` : ''}
              {skipped > 0 ? ` · 跳过 ${skipped}` : ''}。
              <div style={{ marginTop: 10 }}>
                <Space>
                  <Button size="small" onClick={onClose}>
                    关闭
                  </Button>
                  <Button type="primary" size="small" onClick={onViewResult}>
                    查看解析数据
                  </Button>
                </Space>
              </div>
            </div>
          ) : isError ? (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#dc2626',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}
              >
                {error ?? '后端返回未拿到结果，请稍后重试'}
              </div>
              <div style={{ marginTop: 10 }}>
                <Space>
                  <Button size="small" onClick={onDismissError}>
                    关闭
                  </Button>
                  <Button type="primary" size="small" onClick={onRetry}>
                    重新解析
                  </Button>
                </Space>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5 }} className="muted">
              前端轮询超时，后端任务可能仍在继续；下次打开文件夹时会刷新状态。
              <div style={{ marginTop: 10 }}>
                <Button size="small" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : isRunning ? (
        <div style={{ padding: '0 12px 10px' }}>
          <Progress
            percent={percent}
            showInfo={false}
            size="small"
            strokeColor={{ from: '#0ea5e9', to: '#38bdf8' }}
          />
        </div>
      ) : null}
    </div>
  );
}
