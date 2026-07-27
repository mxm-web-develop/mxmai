'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { getOpenApiAdapter } from '@/adapters';
import type { PublishedApiManifest } from '@/adapters/types';
import { MobileSchemaForm } from '@/components/schema/MobileSchemaForm';
import {
  buildDefaultsFromSchema,
  buildFormSections,
  getVisibleSchemaFields,
  type SchemaFormValue,
} from '@/lib/schema-utils';
import { FormFixedFooter } from '@/components/ui/FormFixedFooter';
import { isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { defaultGridShootJobName } from '@/lib/job-display-name';
import { getLocalManifestBySlug } from '@/catalog/manifests';
import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';
import { createProjectFromShootRun } from '@/lib/project/project-lifecycle';

const VIDEO_PREFILL_KEY = 'eshop-video-prefill';

type Props = {
  slug: string;
  title: string;
  subtitle?: string;
};

export function OpenApiTaskForm({ slug, title, subtitle }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const localManifest = getLocalManifestBySlug(slug);
  const [manifest, setManifest] = useState<PublishedApiManifest | null>(() => localManifest);
  const [values, setValues] = useState<SchemaFormValue>(() =>
    localManifest ? buildDefaultsFromSchema(localManifest.inputSchema) : {}
  );
  const [loading, setLoading] = useState(!localManifest);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobName, setJobName] = useState('');

  const loadManifest = useCallback(async () => {
    const hasLocal = Boolean(getLocalManifestBySlug(slug));
    if (!hasLocal) setLoading(true);
    setError(null);
    try {
      const m = await getOpenApiAdapter().getManifest(slug);
      setManifest(m);
      let defaults = buildDefaultsFromSchema(m.inputSchema);
      if (
        slug === S.clothesVideo &&
        searchParams.get('prefill') === '1' &&
        typeof sessionStorage !== 'undefined'
      ) {
        try {
          const raw = sessionStorage.getItem(VIDEO_PREFILL_KEY);
          if (raw) {
            const prefill = JSON.parse(raw) as SchemaFormValue;
            defaults = { ...defaults, ...prefill };
            sessionStorage.removeItem(VIDEO_PREFILL_KEY);
          }
        } catch {
          /* ignore malformed prefill */
        }
      }
      setValues(defaults);
      setJobName(defaultGridShootJobName(title));
    } catch (e) {
      setManifest(null);
      setError(e instanceof Error ? e.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, [slug, searchParams, title]);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  const sections = useMemo(
    () => (manifest ? buildFormSections(manifest.inputSchema) : []),
    [manifest]
  );

  const visibleCount = manifest ? getVisibleSchemaFields(manifest.inputSchema).length : 0;

  const handleSubmit = async () => {
    if (!manifest) return;
    setSubmitting(true);
    setError(null);
    try {
      const displayName = jobName.trim() || defaultGridShootJobName(title);
      const res = await getOpenApiAdapter().run(slug, { params: values, displayName });
      if (isGridShootSlug(slug)) {
        const project = await createProjectFromShootRun({
          platformJobId: res.jobId,
          shootSlug: slug,
          title: displayName,
        });
        router.push(`/projects/${project.projectId}`);
      } else {
        router.push(`/jobs/${res.jobId}?slug=${encodeURIComponent(slug)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-4">
        <div>
          <p className="font-display text-lg font-semibold text-text">{title}</p>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
        </div>
        <div>
          <p className="section-label mb-2">任务名称</p>
          <input
            type="text"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            maxLength={48}
            placeholder="便于在历史中区分本次任务"
            className="input-field"
          />
        </div>
        {manifest?.description && (
          <p className="mt-2 text-xs leading-relaxed text-text-muted">{manifest.description}</p>
        )}
      </section>

      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin text-accent" />
          同步接口配置…
        </p>
      )}

      {!loading && manifest && visibleCount === 0 && (
        <section className="card p-4">
          <p className="text-sm leading-relaxed text-text-secondary">
            本流程由 Smartflow 自动串联商拍与视频节点，确认后即可一键运行全套方案。
          </p>
        </section>
      )}

      {!loading && manifest && visibleCount > 0 && (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.id} className="space-y-3">
              <p className="section-label px-0.5">{section.title}</p>
              {section.subtitle && (
                <p className="-mt-1 px-0.5 text-xs text-text-muted">{section.subtitle}</p>
              )}
              <div className="card p-4">
                <MobileSchemaForm
                  schema={manifest.inputSchema}
                  values={values}
                  onChange={setValues}
                  fieldKeys={section.fieldKeys}
                  fieldHints={manifest.inputDoc?.fieldHints}
                />
              </div>
            </section>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}

      {!loading && manifest && (
        <FormFixedFooter>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="btn-primary"
          >
            {submitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                提交中…
              </>
            ) : (
              <>
                <Sparkles size={20} />
                开始生成
              </>
            )}
          </button>
        </FormFixedFooter>
      )}
    </div>
  );
}
