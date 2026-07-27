'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { ChildTaskList } from '@/components/jobs/ChildTaskList';
import { GridResultPanel } from '@/components/studio/GridResultPanel';
import { ResultGrid } from '@/components/jobs/ResultGrid';
import { useProject } from '@/hooks/useProject';
import { getServiceBySlug } from '@/catalog/services';
import { getGridShootLineBySlug, isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { resolveOutputGridForJob } from '@/lib/grid-cell';
import { cn } from '@/lib/cn';

export default function ProjectDetailPageClient() {
  const params = useParams();
  const projectId = String(params.projectId);
  const { project, job, error, refresh } = useProject(projectId);
  const resultsRetryRef = useRef(0);

  useEffect(() => {
    resultsRetryRef.current = 0;
  }, [projectId]);

  useEffect(() => {
    if (job?.status !== 'completed' || (job.results?.length ?? 0) > 0) return;
    if (resultsRetryRef.current >= 5) return;
    const delay = resultsRetryRef.current === 0 ? 0 : 2000;
    const t = setTimeout(() => {
      resultsRetryRef.current += 1;
      void refresh();
    }, delay);
    return () => clearTimeout(t);
  }, [job?.status, job?.results?.length, refresh]);

  if (!project) {
    return (
      <>
        <PageHeader title="项目详情" backHref="/projects" />
        <main className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-text-muted">
          {error ?? '加载中…'}
        </main>
      </>
    );
  }

  const slug = project.shootSlug;
  const service = getServiceBySlug(slug);
  const line = getGridShootLineBySlug(slug);
  const isDone = project.status === 'completed';
  const isFailed = project.status === 'failed';
  const isActive = !isDone && !isFailed;
  const outputGrid = job ? resolveOutputGridForJob(job, slug) ?? inferOutputGrid(job.results ?? []) : project.outputGrid;
  const isGridShoot = isGridShootSlug(slug);

  const statusText =
    project.status === 'completed'
      ? '生成完成'
      : project.status === 'failed'
        ? '生成失败'
        : project.status === 'processing'
          ? '正在生成九宫格…'
          : '排队等待中';

  return (
    <>
      <PageHeader
        title={project.title}
        subtitle={
          [line?.shortTitle, project.outputGrid ? `${project.outputGrid} 宫格` : null]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        backHref="/projects"
      />
      <main className="space-y-5 px-4 py-4">
        {isActive && (
          <section className="card flex flex-col items-center px-6 py-8">
            <ProgressRing progress={project.progress} active failed={isFailed} />
            <p className="mt-4 font-semibold text-text">{statusText}</p>
            <p className="mt-1 text-xs text-text-muted">
              {project.progress}% · 项目 {projectId.slice(0, 8)}…
            </p>
            {project.parallelCount && project.parallelCount > 1 && (
              <span className="chip mt-3 bg-accent-soft text-accent">
                共 {project.parallelCount} 份并发
              </span>
            )}
          </section>
        )}

        {isFailed && (
          <section className="card flex flex-col items-center px-6 py-6">
            <ProgressRing progress={project.progress} active={false} failed />
            <p className="mt-4 font-semibold text-danger">{statusText}</p>
          </section>
        )}

        {job?.children && job.children.length > 0 && !isDone && (
          <ChildTaskList children={job.children} />
        )}

        {isDone && job && (
          <>
            {job.results && job.results.length > 0 ? (
              isGridShoot || outputGrid === '3x3' || outputGrid === '2x2' ? (
                <GridResultPanel
                  results={job.results}
                  sourceSlug={slug}
                  projectId={projectId}
                  rootPlatformJobId={project.rootPlatformJobId}
                  outputGrid={outputGrid}
                  isGridShoot={isGridShoot}
                  parallelCount={project.parallelCount}
                />
              ) : (
                <ResultGrid
                  results={job.results}
                  outputGrid={outputGrid}
                  sourceSlug={slug}
                  projectId={projectId}
                  rootPlatformJobId={project.rootPlatformJobId}
                  isGridShoot={isGridShoot}
                  clothesLine={service?.clothesLine}
                />
              )
            ) : (
              <CompletedWithoutResults onRetry={() => void refresh()} />
            )}
          </>
        )}

        {isFailed && project.error && (
          <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{project.error}</p>
        )}
      </main>
    </>
  );
}

function CompletedWithoutResults({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="card px-4 py-6 text-center">
      <p className="text-sm font-semibold text-text">成片数据尚未就绪</p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        请通过 Open API 任务详情获取结果（如 metadata.gridCells 或 result.mediaUrls）。
      </p>
      <button type="button" className="btn-primary mt-4 w-full max-w-xs pressable" onClick={onRetry}>
        重新拉取任务
      </button>
    </section>
  );
}

function ProgressRing({
  progress,
  active,
  failed,
}: {
  progress: number;
  active: boolean;
  failed?: boolean;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;

  return (
    <div className="relative h-32 w-32">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" className="progress-ring-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={cn('progress-ring-fill', failed && '!stroke-danger')}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold text-text">{progress}</span>
        <span className="text-xs text-text-muted">%</span>
      </div>
      {active && (
        <span className="absolute -bottom-1 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-accent/30 animate-pulse" />
      )}
    </div>
  );
}

function inferOutputGrid(results: { isGridCell?: boolean }[]): string | undefined {
  const cells = results.filter((r) => r.isGridCell);
  if (cells.length === 9) return '3x3';
  if (cells.length === 4) return '2x2';
  if (cells.length > 1) return '2x2';
  return undefined;
}
