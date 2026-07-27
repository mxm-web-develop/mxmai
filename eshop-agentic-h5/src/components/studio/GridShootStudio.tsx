'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { getOpenApiAdapter } from '@/adapters';
import type { PublishedApiManifest } from '@/adapters/types';
import { ImageIntakePanel } from '@/components/start/ImageIntakePanel';
import {
  GRID_SHOOT_LINES,
  PARALLEL_COUNT_OPTIONS,
  type GridShootLine,
  type GridShootLineId,
  getGridShootLineById,
} from '@/catalog/grid-shoot-lines';
import { GridLayoutPicker } from '@/components/studio/GridLayoutPicker';
import { OUTPUT_GRID_LABELS, cellsPerGrid, type OutputGridLayout } from '@/lib/output-grid';
import {
  buildGridShootParams,
  getModelParticipationOptions,
  getOutputGridOptions,
  getShootPresetOptions,
  resolveDefaultModelParticipation,
  resolveDefaultOutputGrid,
} from '@/lib/build-grid-shoot-params';
import {
  defaultGridShootJobName,
  loadJobNameDraft,
  saveJobNameDraft,
} from '@/lib/job-display-name';
import { getLocalManifestBySlug } from '@/catalog/manifests';
import { createProjectFromShootRun } from '@/lib/project/project-lifecycle';
import { uploadReferenceImagesForSubmit } from '@/lib/upload-reference-image';
import { loadStartDraft, saveStartDraft, type StartDraftImage } from '@/lib/start-draft';
import { FormFixedFooter } from '@/components/ui/FormFixedFooter';
import { IosPickerField } from '@/components/ui/IosPickerField';
import { cn } from '@/lib/cn';

type Props = {
  lineId: GridShootLineId;
};

export function GridShootStudio({ lineId }: Props) {
  const router = useRouter();
  const line: GridShootLine = getGridShootLineById(lineId) ?? GRID_SHOOT_LINES[0];

  const [images, setImages] = useState<StartDraftImage[]>([]);
  const [outputGrid, setOutputGrid] = useState<OutputGridLayout>('3x3');
  const [gridOptions, setGridOptions] = useState<OutputGridLayout[]>(['1x1', '2x2', '3x3']);
  const [parallelCount, setParallelCount] = useState<1 | 2 | 3>(1);
  const [shootPreset, setShootPreset] = useState<string>('');
  const [modelParticipation, setModelParticipation] = useState<string>('default');
  const [prompt, setPrompt] = useState('');
  const [jobName, setJobName] = useState('');
  const [manifest, setManifest] = useState<PublishedApiManifest | null>(() =>
    getLocalManifestBySlug(line.slug)
  );
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setImages(loadStartDraft().images);
    setJobName(loadJobNameDraft(lineId, defaultGridShootJobName(line.shortTitle)));
  }, [lineId, line.shortTitle]);

  const loadManifest = useCallback(async (slug: string) => {
    const hasLocal = Boolean(getLocalManifestBySlug(slug));
    if (!hasLocal) setLoadingManifest(true);
    setError(null);
    try {
      const m = await getOpenApiAdapter().getManifest(slug);
      setManifest(m);
      const presets = getShootPresetOptions(m);
      const def = String(m.inputSchema.properties?.shoot_preset?.default ?? '');
      setShootPreset(presets.some((p) => p.value === def) ? def : presets[0]?.value ?? '');
      setModelParticipation(resolveDefaultModelParticipation(m));
      const grids = getOutputGridOptions(m);
      setGridOptions(grids);
      setOutputGrid((prev) => (grids.includes(prev) ? prev : resolveDefaultOutputGrid(m)));
    } catch (e) {
      setManifest(null);
      setError(e instanceof Error ? e.message : '加载接口配置失败');
    } finally {
      setLoadingManifest(false);
    }
  }, []);

  useEffect(() => {
    void loadManifest(line.slug);
  }, [line.slug, loadManifest]);

  const persistImages = (next: StartDraftImage[]) => {
    setImages(next);
    saveStartDraft(next);
  };

  const presetOptions = manifest ? getShootPresetOptions(manifest) : [];
  const modelParticipationOptions = manifest ? getModelParticipationOptions(manifest) : [];
  const modelParticipationHint = modelParticipationOptions.find(
    (o) => o.value === modelParticipation
  )?.description;

  const handleSubmit = async () => {
    if (!manifest) return;
    if (!images.length) {
      setError('请先上传至少一张商品参考图');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const uploadedImages = await uploadReferenceImagesForSubmit(images);
      const params = buildGridShootParams(line, manifest, {
        images: uploadedImages,
        outputGrid,
        parallelCount,
        shootPreset: shootPreset || undefined,
        modelParticipation: modelParticipationOptions.length
          ? modelParticipation
          : undefined,
        prompt: prompt.trim() || undefined,
      });
      const displayName = jobName.trim() || defaultGridShootJobName(line.shortTitle);
      saveJobNameDraft(lineId, displayName);
      const res = await getOpenApiAdapter().run(line.slug, { params, displayName });
      const project = await createProjectFromShootRun({
        platformJobId: res.jobId,
        shootSlug: line.slug,
        title: displayName,
        outputGrid,
        parallelCount,
        kind: manifest.kind,
      });
      router.push(`/projects/${project.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <GridLayoutPicker
            value={outputGrid}
            onChange={setOutputGrid}
            options={gridOptions}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">
              {line.shortTitle} · {OUTPUT_GRID_LABELS[outputGrid]} · {parallelCount} 份
            </p>
            <p className="text-xs text-text-secondary">
              每份 {cellsPerGrid(outputGrid)} 张商拍 · 点左侧图标改宫格 · 可并发加速
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <p className="section-label px-0.5">任务名称</p>
        <input
          type="text"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          maxLength={48}
          placeholder="例如：春季连衣裙 A 款、直播间 3 号链接"
          className="input-field"
        />
        <p className="px-0.5 text-xs text-text-muted">
          用于历史记录区分，默认可改；留空则自动生成「{line.shortTitle} · 时间」
        </p>
      </section>

      <section className="space-y-3">
        <p className="section-label px-0.5">商品参考图</p>
        <div className="card p-4">
          <ImageIntakePanel images={images} onChange={persistImages} />
        </div>
      </section>

      {modelParticipationOptions.length > 0 && (
        <section className="space-y-3">
          <p className="section-label px-0.5">展示方式</p>
          <div className="flex gap-2">
            {modelParticipationOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setModelParticipation(opt.value)}
                className={cn(
                  'flex-1 rounded-2xl py-3 text-sm font-semibold pressable transition-all',
                  modelParticipation === opt.value
                    ? 'bg-accent text-white shadow-md'
                    : 'border border-border bg-surface text-text-secondary'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {modelParticipationHint && (
            <p className="px-0.5 text-xs leading-relaxed text-text-muted">{modelParticipationHint}</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <p className="section-label px-0.5">生成份数</p>
        <div className="flex gap-2">
          {PARALLEL_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setParallelCount(n)}
              className={
                parallelCount === n
                  ? 'flex-1 rounded-2xl bg-accent py-3 text-sm font-semibold text-white shadow-md pressable transition-all'
                  : 'flex-1 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-text-secondary pressable transition-all'
              }
            >
              {n} 份
            </button>
          ))}
        </div>
        <p className="px-0.5 text-xs leading-relaxed text-text-muted">
          多份适合同 SKU 多风格测图，每份独立一套九宫格
        </p>
      </section>

      {presetOptions.length > 0 && (
        <IosPickerField
          label="拍摄场景"
          value={shootPreset}
          options={presetOptions}
          onChange={setShootPreset}
        />
      )}

      <section className="space-y-2">
        <p className="section-label px-0.5">补充说明（可选）</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="例如：强调面料光泽、柔和窗边光、不要文字水印…"
          className="input-field resize-none"
        />
      </section>

      {loadingManifest && (
        <p className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin text-accent" />
          同步接口配置…
        </p>
      )}

      {error && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <FormFixedFooter>
        <button
          type="button"
          disabled={submitting || !manifest || !images.length}
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
              生成 {line.shortTitle} · {OUTPUT_GRID_LABELS[outputGrid]}
            </>
          )}
        </button>
      </FormFixedFooter>
    </div>
  );
}
