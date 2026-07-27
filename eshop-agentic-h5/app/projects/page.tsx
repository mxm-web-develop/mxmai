'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Inbox, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectCardSkeleton } from '@/components/motion/Skeleton';
import { StaggerReveal } from '@/components/motion/StaggerReveal';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { useProjectList } from '@/hooks/useProject';
import { useMobileDialog } from '@/contexts/MobileDialogContext';

export default function ProjectsPage() {
  const { confirm } = useMobileDialog();
  const { projects, loading, removeProject } = useProjectList();

  const handleDelete = async (projectId: string) => {
    const project = projects.find((p) => p.projectId === projectId);
    const name = project?.title ?? '该项目';
    const ok = await confirm({
      message: `从本机删除「${name}」？\n本地成片缓存会一并清除；平台侧任务记录不受影响。`,
      confirmLabel: '删除',
      cancelLabel: '取消',
      destructive: true,
    });
    if (ok) void removeProject(projectId);
  };

  return (
    <>
      <PageHeader title="项目" subtitle="商拍与衍生任务" />
      <main className="space-y-3 px-4 py-4">
        {loading && !projects.length ? (
          <div className="space-y-3" aria-busy="true" aria-label="加载项目">
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
          </div>
        ) : projects.length ? (
          <StaggerReveal className="space-y-3" childSelector="> *">
            {projects.map((p) => (
              <ProjectCard key={p.projectId} project={p} onDelete={handleDelete} />
            ))}
          </StaggerReveal>
        ) : (
          <div className="card flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Inbox size={32} strokeWidth={1.5} />
            </div>
            <p className="mt-4 font-display text-lg font-semibold text-text">还没有项目</p>
            <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-text-secondary">
              完成一次九宫格生成后，进度与成片会出现在这里
            </p>
            <NavLink href="/start" className="btn-primary mt-8 max-w-xs">
              <Sparkles size={18} />
              去创作
            </NavLink>
          </div>
        )}
      </main>
    </>
  );
}
