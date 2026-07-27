'use client';

import Image from 'next/image';
import { ArrowRight, Grid3X3, FolderOpen, Settings, Sparkles, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StaggerReveal } from '@/components/motion/StaggerReveal';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { NavLink } from '@/components/ui/NavLink';
import { usePrefetchRoutes } from '@/hooks/usePrefetchRoutes';
import { useProjectList } from '@/hooks/useProject';
import { AccountStatusBanner } from '@/components/auth/AccountStatusBanner';

const STEPS = [
  { n: '01', title: '选业务类型', desc: '摄影 / 设计海报 / 模特动效 / Smartflow 全套' },
  { n: '02', title: '填写专属表单', desc: '摄影线 3×3 宫格，可选 1～3 份并发' },
  { n: '03', title: '点格高清放大', desc: '项目内查看成片，单格 HD 导出' },
];

export default function HomePage() {
  const { projects } = useProjectList();
  const recent = projects.slice(0, 2);

  usePrefetchRoutes(['/start', '/projects', '/settings']);

  return (
    <>
      <PageHeader
        title="一拍上架"
        subtitle="AI 商拍 · 九宫格 · 高清"
        transparent
        action={
          <NavLink
            href="/settings"
            pendingSubtle
            className="touch-target flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-text-secondary shadow-sm"
            aria-label="设置"
          >
            <Settings size={20} />
          </NavLink>
        }
      />

      <main className="space-y-5 px-4 pb-6 pt-2">
        <StaggerReveal className="space-y-5">
        <AccountStatusBanner />

        <section className="hero-mesh relative overflow-hidden rounded-[1.75rem] border border-border/60 p-6 shadow-[var(--shadow-card)]">
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-sm">
              <Image src="/brand/grid-icon.svg" alt="" width={40} height={40} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="chip bg-accent-soft text-accent">专业电商商拍</p>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-snug text-text text-balance">
                一张图，九张上架角度
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                上传商品参考图，AI 生成 3×3 商拍宫格，点选单格即可高清放大，适合淘宝、独立站货架图。
              </p>
            </div>
          </div>

          <NavLink href="/start" className="btn-primary relative z-10 mt-6">
            <Sparkles size={20} />
            开始创作
            <ArrowRight size={18} className="opacity-80" />
          </NavLink>

          <div className="mt-5 flex gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-surface/70 px-3 py-2.5 text-xs text-text-secondary">
              <Grid3X3 size={16} className="shrink-0 text-accent" />
              固定 3×3
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-surface/70 px-3 py-2.5 text-xs text-text-secondary">
              <Zap size={16} className="shrink-0 text-accent" />
              最多 3 份并发
            </div>
          </div>
        </section>

        <section className="card p-5">
          <p className="section-label">怎么用</p>
          <ul className="mt-4 space-y-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="font-display text-lg font-semibold text-accent/80">{s.n}</span>
                <div>
                  <p className="font-semibold text-text">{s.title}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">{s.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {recent.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="section-label">最近项目</p>
              <NavLink
                href="/projects"
                pendingSubtle
                className="flex items-center gap-1 text-sm font-medium text-accent"
              >
                <FolderOpen size={16} />
                全部
              </NavLink>
            </div>
            <StaggerReveal className="space-y-3" childSelector="> *">
              {recent.map((p) => (
                <ProjectCard key={p.projectId} project={p} />
              ))}
            </StaggerReveal>
          </section>
        )}
        </StaggerReveal>
      </main>
    </>
  );
}
