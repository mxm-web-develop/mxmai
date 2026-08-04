/**
 * 媒体查看器「数据」页：状态 / 报错 / 管线步骤 / 完整 JSON
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import './TaskViewerDataPanel.css';

export type TaskViewerDataLike = {
  id?: string;
  type?: string;
  status?: string;
  progress?: { status?: string; progress?: number; error?: string };
  result?: { metadata?: Record<string, unknown> } | null;
  metadata?: Record<string, unknown> | null;
  requestParams?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

type PipelineTraceEntry = {
  step: string;
  durationMs?: number;
  nestedTaskId?: string;
  costUsd?: number;
  phase?: 'pre' | 'post' | 'enrich' | string;
  skipped?: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseTrace(raw: unknown): PipelineTraceEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PipelineTraceEntry[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || typeof row.step !== 'string' || !row.step.trim()) continue;
    out.push({
      step: row.step.trim(),
      durationMs: typeof row.durationMs === 'number' ? row.durationMs : undefined,
      nestedTaskId: typeof row.nestedTaskId === 'string' ? row.nestedTaskId : undefined,
      costUsd: typeof row.costUsd === 'number' ? row.costUsd : undefined,
      phase: typeof row.phase === 'string' ? row.phase : undefined,
      skipped: row.skipped === true,
    });
  }
  return out;
}

/** 从 result / requestParams.businessPipelineState / metadata 收集管线轨迹 */
export function collectPipelineTrace(task: TaskViewerDataLike | null | undefined): PipelineTraceEntry[] {
  if (!task) return [];
  const fromResult = parseTrace(task.result?.metadata?.pipelineTrace);
  if (fromResult.length) return fromResult;

  const rp = asRecord(task.requestParams);
  const bps = asRecord(rp?.businessPipelineState) ?? asRecord(rp?.params && asRecord(rp.params)?.businessPipelineState);
  const fromBps = parseTrace(bps?.pipelineTrace);
  if (fromBps.length) return fromBps;

  return parseTrace(task.metadata?.pipelineTrace);
}

function formatDuration(ms: number | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return t('common.viewer.taskData.durationMs', { ms: Math.round(ms) });
  return t('common.viewer.taskData.durationSec', { sec: (ms / 1000).toFixed(1) });
}

function phaseLabel(phase: string | undefined, t: (k: string) => string): string | null {
  if (!phase) return null;
  if (phase === 'pre') return t('common.viewer.taskData.phasePre');
  if (phase === 'post') return t('common.viewer.taskData.phasePost');
  if (phase === 'enrich') return t('common.viewer.taskData.phaseEnrich');
  return phase;
}

export function TaskViewerDataPanel({ task }: { task: TaskViewerDataLike | null }) {
  const { t } = useTranslation();
  const [rawOpen, setRawOpen] = useState(false);

  const status = task?.status ?? '—';
  const statusLabel = task?.status ? getTaskStatusLabel(task.status, t) : '—';
  const progressPct =
    typeof task?.progress?.progress === 'number' && !Number.isNaN(task.progress.progress)
      ? Math.min(100, Math.max(0, task.progress.progress))
      : null;
  const errorTextRaw = (task?.progress?.error || '').trim() || null;
  const errorDebug =
    typeof (task?.progress as { errorDebug?: unknown } | undefined)?.errorDebug === 'string'
      ? String((task?.progress as { errorDebug?: string }).errorDebug).trim()
      : '';
  const errorText = errorDebug || errorTextRaw;
  const isFailed = status === 'failed' || status === 'cancelled' || status === 'network_error';
  const steps = useMemo(() => collectPipelineTrace(task), [task]);
  const failedStepHint = useMemo(() => {
    if (!errorDebug && !errorTextRaw) return null;
    const probe = errorDebug || errorTextRaw || '';
    const m = probe.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*[：:]/);
    return m?.[1] ?? null;
  }, [errorDebug, errorTextRaw]);

  if (!task) {
    return <p className="tvd-empty">{t('common.viewer.noTaskData')}</p>;
  }

  return (
    <div className="tvd-root">
      <section className="tvd-card" aria-label={t('common.viewer.taskData.overview')}>
        <div className="tvd-card__title">{t('common.viewer.taskData.overview')}</div>
        <dl className="tvd-kv">
          <div className="tvd-kv__row">
            <dt>{t('common.viewer.taskData.status')}</dt>
            <dd>
              <span className={`tvd-status tvd-status--${isFailed ? 'failed' : status === 'completed' ? 'ok' : 'run'}`}>
                {statusLabel}
              </span>
              {statusLabel !== status ? <span className="tvd-muted"> ({status})</span> : null}
            </dd>
          </div>
          <div className="tvd-kv__row">
            <dt>{t('common.viewer.taskData.progress')}</dt>
            <dd>{progressPct != null ? `${Math.round(progressPct)}%` : '—'}</dd>
          </div>
          {task.id ? (
            <div className="tvd-kv__row">
              <dt>{t('common.viewer.taskData.taskId')}</dt>
              <dd className="tvd-mono">{task.id}</dd>
            </div>
          ) : null}
          {task.type ? (
            <div className="tvd-kv__row">
              <dt>{t('common.viewer.taskData.type')}</dt>
              <dd className="tvd-mono">{task.type}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {errorText ? (
        <section className="tvd-card tvd-card--error" aria-label={t('common.viewer.taskData.error')}>
          <div className="tvd-card__title">{t('common.viewer.taskData.error')}</div>
          {failedStepHint ? (
            <p className="tvd-fail-step">
              {t('common.viewer.taskData.failedAtStep', { step: failedStepHint })}
            </p>
          ) : null}
          <p className="tvd-error-text">{errorTextRaw}</p>
          {errorDebug && errorDebug !== errorTextRaw ? (
            <pre className="tvd-error-debug">{errorDebug}</pre>
          ) : null}
        </section>
      ) : null}

      <section className="tvd-card" aria-label={t('common.viewer.taskData.pipeline')}>
        <div className="tvd-card__title">{t('common.viewer.taskData.pipeline')}</div>
        {steps.length === 0 ? (
          <p className="tvd-muted tvd-empty-hint">
            {errorText
              ? t('common.viewer.taskData.noStepsWithError')
              : t('common.viewer.taskData.noSteps')}
          </p>
        ) : (
          <ol className="tvd-steps">
            {steps.map((s, i) => {
              const phase = phaseLabel(s.phase, t);
              return (
                <li
                  key={`${s.step}-${i}`}
                  className={`tvd-step${s.skipped ? ' tvd-step--skipped' : ''}`}
                >
                  <div className="tvd-step__index" aria-hidden>
                    {i + 1}
                  </div>
                  <div className="tvd-step__body">
                    <div className="tvd-step__name">
                      {s.step}
                      {s.skipped ? (
                        <span className="tvd-pill">{t('common.viewer.taskData.skipped')}</span>
                      ) : (
                        <span className="tvd-pill tvd-pill--ok">{t('common.viewer.taskData.done')}</span>
                      )}
                    </div>
                    <div className="tvd-step__meta">
                      {phase ? <span>{phase}</span> : null}
                      <span>{formatDuration(s.durationMs, t)}</span>
                      {s.nestedTaskId ? (
                        <span className="tvd-mono" title={s.nestedTaskId}>
                          {t('common.viewer.taskData.nestedTask')}: {s.nestedTaskId.slice(0, 8)}…
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {errorText && steps.length > 0 ? (
          <p className="tvd-fail-hint">{t('common.viewer.taskData.failedAfterSteps')}</p>
        ) : null}
      </section>

      <section className="tvd-card tvd-card--raw">
        <button
          type="button"
          className="tvd-raw-toggle"
          aria-expanded={rawOpen}
          onClick={() => setRawOpen((v) => !v)}
        >
          {rawOpen
            ? t('common.viewer.taskData.hideRaw')
            : t('common.viewer.taskData.showRaw')}
        </button>
        {rawOpen ? <pre className="tvd-pre">{JSON.stringify(task, null, 2)}</pre> : null}
      </section>
    </div>
  );
}
