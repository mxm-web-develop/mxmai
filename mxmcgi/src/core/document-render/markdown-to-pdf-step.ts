import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PipelineStep, TaskContext } from '../../tasks/types';
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

export type MarkdownToPdfStorageMode = 'sidecar' | 'overwrite';

export type PdfStorageInfo = {
  key: string;
  bucket: string;
  url: string;
};

function parseRenderer(raw: unknown): DocumentPdfRenderer {
  const value = String(raw ?? 'markdown').trim().toLowerCase();
  if (value === 'markdown' || value === 'styled' || value === 'html') {
    return value;
  }
  return 'markdown';
}

function parseStorageMode(raw: unknown): MarkdownToPdfStorageMode {
  return String(raw ?? 'sidecar').trim().toLowerCase() === 'overwrite' ? 'overwrite' : 'sidecar';
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
): Promise<{ text: string; taskId?: string }> {
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
  return { text, taskId: last?.taskId };
}

function appendWarning(meta: Record<string, unknown>, message: string): string[] {
  const prev = Array.isArray(meta.warnings)
    ? meta.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  if (prev.includes(message)) return prev;
  return [...prev, message];
}

function failSoft(
  ctx: TaskContext,
  step: PipelineStep,
  markdown: string,
  errorMessage: string
): TaskContext {
  const storageMode = parseStorageMode(step.params?.storageMode);
  const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? {
    kind: 'text',
    text: markdown,
  };
  const coreMeta = (core.metadata as Record<string, unknown> | undefined) ?? {};
  const warning = `PDF 生成失败：${errorMessage}`;

  const finalArtifact = {
    kind: 'text' as const,
    text: markdown || (typeof core.text === 'string' ? core.text : ''),
    mediaUrls: Array.isArray(core.mediaUrls) ? (core.mediaUrls as string[]) : undefined,
    metadata: {
      ...coreMeta,
      text: markdown || coreMeta.text,
      format: 'markdown',
      storage_form: 'markdown',
      pdfRenderStatus: 'failed',
      pdfRenderError: errorMessage,
      warnings: appendWarning(coreMeta, warning),
      markdownToPdfStorageMode: storageMode,
    },
  };

  console.warn(`[markdownToPdf] ${warning}`);

  return {
    ...ctx,
    state: {
      ...ctx.state,
      finalArtifact,
      coreArtifact: ctx.state.coreArtifact ?? finalArtifact,
      markdownToPdfStorage: undefined,
      markdownToPdfStatus: 'failed',
      markdownToPdfError: errorMessage,
      markdownToPdfStorageMode: storageMode,
    },
  };
}

/**
 * Post 节点：Markdown → PDF。
 * - 默认 sidecar：主存仍为 Markdown，PDF 地址写入 metadata.pdfStorage
 * - overwrite：PDF 覆盖主 storageInfo（Admin 可配；仍保留 metadata.text）
 * - 失败不抛错：任务可继续成功，写入 pdfRenderStatus=failed + warnings
 */
export async function runMarkdownToPdfStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const inputs = collectStepInputs(ctx, step);
  const markdown = String(inputs.markdown ?? '').trim();
  if (!markdown) {
    return failSoft(ctx, step, '', '缺少 markdown 输入（state.coreArtifact.text）');
  }

  const storageMode = parseStorageMode(step.params?.storageMode);
  const includeCover = step.params?.includeCover !== false;
  const includeToc = step.params?.includeToc !== false;
  const useLayoutLlm = step.params?.useLayoutLlm === true || Boolean(step.layoutTaskKey?.trim());

  try {
    const renderer = parseRenderer(inputs.renderer ?? inputs.pdf_renderer ?? step.params?.renderer);
    const designStyle = String(
      inputs.design_style ?? inputs.designStyle ?? step.params?.designStyle ?? 'modern_sidebar'
    ).trim();
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

    let spec: DocumentRenderSpecV1 | undefined;
    let layoutTaskId: string | undefined;
    let usedFallback = false;
    let lastLayoutError: string | undefined;

    if (useLayoutLlm || renderer === 'styled' || renderer === 'html') {
      const layoutPayload = {
        markdown,
        structured: structured ?? {},
        renderer,
        design_style: designStyle,
        assets: JSON.stringify(formAssets),
      };

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
    }

    const effectiveRenderer = spec ? renderer : fallbackRenderer;
    if (!spec && (renderer === 'styled' || renderer === 'html')) {
      usedFallback = renderer !== fallbackRenderer;
      if (lastLayoutError) {
        console.warn(
          `[markdownToPdf] layout/spec 失败，fallback=${fallbackRenderer}: ${lastLayoutError}`
        );
      }
    }

    const title =
      (typeof inputs.title === 'string' && inputs.title.trim()
        ? inputs.title.trim()
        : undefined) ||
      (structured &&
      typeof structured === 'object' &&
      (structured as { meta?: { title?: string; name?: string } }).meta
        ? ((structured as { meta: { title?: string; name?: string } }).meta.title ??
          (structured as { meta: { title?: string; name?: string } }).meta.name)
        : undefined);

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
      pdfOptions: {
        includeCover,
        includeToc,
      },
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
        storageMode,
      },
    });

    const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 3600);
    const pdfStorage: PdfStorageInfo = { key, bucket, url };

    const pipeline = {
      ...((ctx.state.pipeline as Record<string, unknown> | undefined) ?? {}),
      documentRenderSpec: rendered.spec ?? spec,
      documentLayoutHtml: rendered.spec?.layoutHtml,
      documentRenderMeta: {
        ...rendered.meta,
        usedFallback: usedFallback || rendered.meta.usedFallback,
        layoutTaskKey,
        layoutTaskId,
        includeCover,
        includeToc,
        storageMode,
      },
    };

    const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? {
      kind: 'text',
      text: markdown,
    };
    const coreMeta = (core.metadata as Record<string, unknown> | undefined) ?? {};

    const metadata: Record<string, unknown> = {
      ...coreMeta,
      text: markdown,
      format: 'markdown',
      storage_form: 'markdown',
      reading_format: 'pdf',
      designStyle,
      pdf_renderer: effectiveRenderer,
      documentRenderSpec: rendered.spec ?? spec,
      documentRenderMeta: pipeline.documentRenderMeta,
      pdfStorage,
      pdfRenderStatus: 'ok',
      markdownToPdfStorageMode: storageMode,
    };

    if (storageMode === 'overwrite') {
      metadata.format = 'pdf';
      metadata.storage_form = 'pdf';
      metadata.reading_format = 'pdf';
    }

    const finalArtifact = {
      kind: 'text' as const,
      text: markdown,
      mediaUrls: [url],
      metadata,
    };

    return {
      ...ctx,
      state: {
        ...ctx.state,
        pipeline,
        finalArtifact,
        coreArtifact: ctx.state.coreArtifact ?? finalArtifact,
        markdownToPdfStorage: pdfStorage,
        markdownToPdfStatus: 'ok',
        markdownToPdfStorageMode: storageMode,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failSoft(ctx, step, markdown, message);
  }
}
