import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PipelineStep, TaskContext } from '../../tasks/types';
import { ConfigurationError } from '../../tasks/errors';
import { interpolatePipelineTemplate } from '../../tasks/business-pipeline';
import { runNestedTextStep } from '../../tasks/business-pipeline-steps';
import type { DocumentPdfRenderer, DocumentRenderSpecV1 } from './types';
import {
  mergeRenderAssets,
  resolveRenderAssetsFromFormFields,
} from './resolve-render-assets';
import {
  parseLayoutLlmOutput,
  validateDocumentRenderSpec,
} from './validate-document-render-spec';
import { renderDocumentPdfBuffer } from './render-document-pdf';
import { getGeneratedBucket } from '../../storage/generated-temp';

function parseRenderer(raw: unknown): DocumentPdfRenderer {
  const value = String(raw ?? 'styled').trim().toLowerCase();
  if (value === 'markdown' || value === 'styled' || value === 'html') {
    return value;
  }
  return 'styled';
}

function parseStructured(raw: unknown): unknown {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function collectStepInputs(
  ctx: TaskContext,
  step: PipelineStep
): Record<string, unknown> {
  const mapping = step.inputMapping ?? {
    markdown: '${state.coreArtifact.text}',
    renderer: '${params.pdf_renderer}',
    design_style: '${params.design_style}',
  };
  const out: Record<string, unknown> = {};
  for (const [field, tmpl] of Object.entries(mapping)) {
    out[field] = interpolatePipelineTemplate(tmpl, ctx);
  }
  return out;
}

async function callLayoutNestedText(
  ctx: TaskContext,
  step: PipelineStep,
  layoutInputs: Record<string, unknown>
): Promise<{ text: string; taskId?: string; costUsd?: number }> {
  const layoutTaskKey =
    step.layoutTaskKey?.trim() ||
    (typeof step.params?.layoutTaskKey === 'string' ? step.params.layoutTaskKey.trim() : '') ||
    'text/layout/document-render-spec';

  const nestedStep: PipelineStep = {
    step: 'nestedText',
    nestedTextTaskKey: layoutTaskKey,
    inputMapping: Object.fromEntries(
      Object.entries(layoutInputs).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : JSON.stringify(v),
      ])
    ),
  };

  const nestedCtx = await runNestedTextStep(ctx, nestedStep);
  const text =
    (nestedCtx.state.nestedTextLast as { text?: string } | undefined)?.text?.trim() ?? '';
  const last = nestedCtx.state.nestedTextLast as { taskId?: string } | undefined;
  const usage = Array.isArray(nestedCtx.state.pipelineNestedUsage)
    ? (nestedCtx.state.pipelineNestedUsage as { costUsd?: number }[])
    : [];
  const costUsd = usage.length > 0 ? usage[usage.length - 1]?.costUsd : undefined;

  return { text, taskId: last?.taskId, costUsd };
}

export async function runRenderDocumentPdfStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const inputs = collectStepInputs(ctx, step);
  const markdown = String(inputs.markdown ?? '').trim();
  if (!markdown) {
    throw new ConfigurationError('renderDocumentPdf 缺少 markdown 输入（state.coreArtifact.text）');
  }

  const renderer = parseRenderer(inputs.renderer ?? inputs.pdf_renderer);
  const designStyle = String(inputs.design_style ?? inputs.designStyle ?? 'modern_sidebar').trim();
  const structured = parseStructured(inputs.structured);

  const formAssets = resolveRenderAssetsFromFormFields({
    profile_photo: inputs.profile_photo,
    images: inputs.images,
  });

  const maxRetries = Math.max(1, Number(step.params?.maxRetries ?? 2));
  const fallbackRenderer = parseRenderer(step.params?.fallbackRenderer ?? 'markdown');
  const layoutTaskKey =
    step.layoutTaskKey?.trim() ||
    (typeof step.params?.layoutTaskKey === 'string' ? step.params.layoutTaskKey : undefined);

  const layoutPayload = {
    markdown,
    structured: structured ?? {},
    renderer,
    design_style: designStyle,
    assets: JSON.stringify(formAssets),
  };

  let spec: DocumentRenderSpecV1 | undefined;
  let layoutTaskId: string | undefined;
  let usedFallback = false;
  let lastLayoutError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const layout = await callLayoutNestedText(ctx, step, layoutPayload);
      layoutTaskId = layout.taskId;
      const parsed = parseLayoutLlmOutput(layout.text);
      const candidate =
        parsed && typeof parsed === 'object' && 'documentRenderSpec' in (parsed as object)
          ? ((parsed as { documentRenderSpec: DocumentRenderSpecV1 }).documentRenderSpec ??
            (parsed as DocumentRenderSpecV1))
          : (parsed as DocumentRenderSpecV1);

      const validated = validateDocumentRenderSpec(candidate, renderer);
      if (!validated.ok) {
        lastLayoutError = validated.errors.join('; ');
        continue;
      }

      spec = {
        ...validated.spec,
        assets: mergeRenderAssets(validated.spec.assets, formAssets),
        layoutHtml:
          validated.spec.layoutHtml ??
          (parsed &&
          typeof parsed === 'object' &&
          typeof (parsed as { documentLayoutHtml?: string }).documentLayoutHtml === 'string'
            ? (parsed as { documentLayoutHtml: string }).documentLayoutHtml
            : undefined),
      };
      break;
    } catch (err) {
      lastLayoutError = err instanceof Error ? err.message : String(err);
    }
  }

  const effectiveRenderer = spec ? renderer : fallbackRenderer;
  if (!spec) {
    usedFallback = renderer !== fallbackRenderer;
    if (lastLayoutError) {
      console.warn(
        `[renderDocumentPdf] layout/spec 失败，fallback=${fallbackRenderer}: ${lastLayoutError}`
      );
    }
  }

  const title =
    structured &&
    typeof structured === 'object' &&
    (structured as { meta?: { title?: string; name?: string } }).meta
      ? ((structured as { meta: { title?: string; name?: string } }).meta.title ??
        (structured as { meta: { title?: string; name?: string } }).meta.name)
      : undefined;

  const rendered = await renderDocumentPdfBuffer({
    context: {
      markdown,
      structured,
      renderer: effectiveRenderer,
      designStyle,
      assets: mergeRenderAssets(spec?.assets, formAssets),
    },
    spec: spec ?? null,
    title: typeof title === 'string' ? title : undefined,
  });

  const userId = ctx.userId ?? 'anonymous';
  const storageRepo = RepositoryFactory.createStorageRepository();
  const bucket = getGeneratedBucket();
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 8);
  const key = `${userId}/writing/${timestamp}-${randomId}.pdf`;

  await storageRepo.uploadFile(bucket, key, rendered.buffer, {
    contentType: 'application/pdf',
    metadata: {
      userId,
      format: 'pdf',
      renderer: effectiveRenderer,
      designStyle,
    },
  });

  const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 3600);
  const storageInfo = { key, bucket, url };

  const pipeline = {
    ...((ctx.state.pipeline as Record<string, unknown> | undefined) ?? {}),
    documentRenderSpec: rendered.spec ?? spec,
    documentLayoutHtml: rendered.spec?.layoutHtml,
    documentRenderMeta: {
      ...rendered.meta,
      usedFallback: usedFallback || rendered.meta.usedFallback,
      layoutTaskKey,
      layoutTaskId,
    },
  };

  const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? {
    kind: 'text',
    text: markdown,
  };

  const finalArtifact = {
    kind: 'text' as const,
    text: markdown,
    mediaUrls: [url],
    metadata: {
      ...((core.metadata as Record<string, unknown> | undefined) ?? {}),
      text: markdown,
      format: 'pdf',
      storage_form: 'pdf',
      designStyle,
      pdf_renderer: effectiveRenderer,
      documentRenderSpec: rendered.spec ?? spec,
      documentRenderMeta: pipeline.documentRenderMeta,
    },
  };

  return {
    ...ctx,
    state: {
      ...ctx.state,
      pipeline,
      finalArtifact,
      coreArtifact: ctx.state.coreArtifact ?? finalArtifact,
      renderDocumentPdfStorage: storageInfo,
    },
  };
}
