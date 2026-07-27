import { NavLink } from '@/components/ui/NavLink';
import { PressableButton } from '@/components/ui/PressableButton';
import { ChevronRight, Trash2 } from 'lucide-react';
import type { ProjectListItem } from '@/lib/project/types';
import { getGridShootLineBySlug } from '@/catalog/grid-shoot-lines';
import { cn } from '@/lib/cn';

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: '排队中', className: 'bg-surface-muted text-text-secondary' },
  processing: { label: '生成中', className: 'bg-accent-soft text-accent' },
  completed: { label: '已完成', className: 'bg-success-soft text-success' },
  failed: { label: '失败', className: 'bg-danger-soft text-danger' },
};

function ProjectCardThumb({
  project,
  lineClass,
  fallbackLabel,
}: {
  project: ProjectListItem;
  lineClass?: string;
  fallbackLabel: string;
}) {
  if (project.coverUrl) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-surface-muted ring-1 ring-border/60">
        <img
          src={project.coverUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        {(project.status === 'pending' || project.status === 'processing') && (
          <span className="absolute inset-0 bg-black/20" aria-hidden />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold',
        lineClass ?? 'bg-surface-muted text-text-secondary'
      )}
    >
      {fallbackLabel}
    </div>
  );
}

export function ProjectCard({
  project,
  onDelete,
}: {
  project: ProjectListItem;
  onDelete?: (projectId: string) => void;
}) {
  const line = getGridShootLineBySlug(project.shootSlug);
  const st = STATUS[project.status] ?? { label: project.status, className: 'bg-surface-muted' };

  return (
    <div className="card flex items-center gap-2 p-2 pl-4 transition-[box-shadow,border-color] duration-[var(--motion-normal)] hover:shadow-[var(--shadow-float)]">
      <NavLink
        href={`/projects/${project.projectId}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <ProjectCardThumb
          project={project}
          lineClass={line?.cardClass}
          fallbackLabel={line?.shortTitle?.slice(0, 1) ?? '项'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-text">{project.title}</p>
            <span className={cn('chip shrink-0', st.className)}>{st.label}</span>
          </div>
          {line?.shortTitle && (
            <p className="mt-0.5 text-xs text-text-muted">{line.shortTitle}</p>
          )}
          <p className="mt-1 text-xs text-text-muted">
            {new Date(project.createdAt).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {project.parallelCount && project.parallelCount > 1
              ? ` · ${project.parallelCount} 份`
              : ''}
            {project.assetCount != null && project.assetCount > 0
              ? ` · ${project.assetCount} 张`
              : ''}
          </p>
          {project.status !== 'completed' && project.status !== 'failed' && (
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/80 to-accent transition-all"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          )}
        </div>

        <ChevronRight size={20} className="shrink-0 text-text-muted" />
      </NavLink>

      {onDelete && (
        <PressableButton
          aria-label={`删除 ${project.title}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-muted pressable hover:bg-danger-soft hover:text-danger"
          onClick={() => onDelete(project.projectId)}
        >
          <Trash2 size={18} />
        </PressableButton>
      )}
    </div>
  );
}
