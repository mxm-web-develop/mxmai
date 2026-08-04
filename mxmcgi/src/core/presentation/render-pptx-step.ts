/**
 * 管线步骤：renderPptx — 结构化 slides IR → PPTX sidecar（串行编译）。
 *
 * params:
 * - slidesFrom: 默认 contract.business.slides
 * - visualSystemFrom: 默认 contract.basic.visual_system
 * - titleFrom: 默认 contract.basic.title
 * - maxPages: 默认 16，硬上限 24
 * - failSoft: 默认 true（失败写入 status，不抛死任务）
 */
import { spawn } from 'node:child_process';
import { accessSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PipelineStep, TaskContext } from '../../tasks/types';
import { ConfigurationError } from '../../tasks/errors';
import { getGeneratedBucket } from '../../storage/generated-temp';
import {
  assembleDeckOutlineMarkdown,
  clampDeckPageCount,
  DEFAULT_MAX_DECK_PAGES,
  HARD_MAX_DECK_PAGES,
  type DeckSlideIr,
  type DeckVisualSystem,
} from './deck-ir';
import {
  compileDeckViaApi,
  isPptxCompilerApiConfigured,
} from './pptx-compiler-client';

export type PresentationStorageInfo = {
  key: string;
  bucket: string;
  url?: string;
};

function readByPath(root: unknown, pathStr: string): unknown {
  let cur: unknown = root;
  for (const seg of pathStr.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function resolveCompilerScript(): string {
  const candidates = [
    path.join(__dirname, '../../../tools/pptx-compiler/build_pptx_from_ir.py'),
    path.join(__dirname, '../../../../tools/pptx-compiler/build_pptx_from_ir.py'),
    path.join(process.cwd(), 'tools/pptx-compiler/build_pptx_from_ir.py'),
    path.join(process.cwd(), 'mxmcgi/tools/pptx-compiler/build_pptx_from_ir.py'),
  ];
  for (const p of candidates) {
    try {
      accessSync(p);
      return p;
    } catch {
      /* next */
    }
  }
  return candidates[0]!;
}

function resolvePythonBin(): string {
  return (
    process.env.PPTX_PYTHON_BIN?.trim() ||
    process.env.PYTHON_BIN?.trim() ||
    'python3'
  );
}

async function runCompiler(inputJson: string, outputPptx: string): Promise<void> {
  const script = resolveCompilerScript();
  const py = resolvePythonBin();
  await fs.access(script);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(py, [script, '--input', inputJson, '--output', outputPptx], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `pptx compiler exit ${code}: ${(stderr || stdout || 'unknown').slice(0, 800)}`
          )
        );
      }
    });
  });
}

function normalizeSlides(raw: unknown, maxPages: number): DeckSlideIr[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckSlideIr[] = [];
  for (let i = 0; i < raw.length && out.length < maxPages; i++) {
    const it = raw[i];
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const o = it as Record<string, unknown>;
    out.push({
      id: String(o.id ?? `s${i + 1}`),
      order: typeof o.order === 'number' ? o.order : i + 1,
      role: String(o.role ?? 'content'),
      title: String(o.title ?? '').trim(),
      subtitle: typeof o.subtitle === 'string' ? o.subtitle : undefined,
      bullets: Array.isArray(o.bullets)
        ? o.bullets.map((b) => String(b)).filter(Boolean)
        : undefined,
      body: typeof o.body === 'string' ? o.body : undefined,
      notes: typeof o.notes === 'string' ? o.notes : undefined,
      layout_hint: typeof o.layout_hint === 'string' ? o.layout_hint : undefined,
      page_style:
        o.page_style && typeof o.page_style === 'object' && !Array.isArray(o.page_style)
          ? (o.page_style as DeckSlideIr['page_style'])
          : undefined,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

function failSoft(
  ctx: TaskContext,
  errorMessage: string,
  slides: DeckSlideIr[],
  title: string
): TaskContext {
  const outline = assembleDeckOutlineMarkdown({ title, slides });
  const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? {
    kind: 'text',
    text: outline,
  };
  const coreMeta = (core.metadata as Record<string, unknown> | undefined) ?? {};
  const warning = `PPTX 生成失败：${errorMessage}`;
  const warnings = Array.isArray(coreMeta.warnings)
    ? [...(coreMeta.warnings as string[]).filter((w) => typeof w === 'string'), warning]
    : [warning];
  const unique = [...new Set(warnings)];
  return {
    ...ctx,
    state: {
      ...ctx.state,
      renderPptxStatus: 'failed',
      renderPptxError: errorMessage,
      coreArtifact: {
        ...core,
        text: typeof core.text === 'string' && core.text.trim() ? core.text : outline,
        metadata: { ...coreMeta, warnings: unique, presentationRenderStatus: 'failed' },
      },
      finalArtifact: {
        kind: 'text',
        text: typeof core.text === 'string' && core.text.trim() ? String(core.text) : outline,
        metadata: {
          ...coreMeta,
          warnings: unique,
          presentationRenderStatus: 'failed',
          presentationRenderError: errorMessage,
        },
      },
    },
  };
}

export async function runRenderPptxStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const soft = params.failSoft !== false;
  const maxPages = Math.min(
    HARD_MAX_DECK_PAGES,
    clampDeckPageCount(params.maxPages ?? DEFAULT_MAX_DECK_PAGES, DEFAULT_MAX_DECK_PAGES)
  );

  const contract =
    ctx.state.contract && typeof ctx.state.contract === 'object'
      ? (ctx.state.contract as Record<string, unknown>)
      : {};
  const slidesFrom = String(params.slidesFrom ?? 'contract.business.slides').trim();
  const visualFrom = String(params.visualSystemFrom ?? 'contract.business.visual_system').trim();
  const titleFrom = String(params.titleFrom ?? 'contract.basic.title').trim();

  const slidesRaw = slidesFrom.startsWith('contract.')
    ? readByPath(contract, slidesFrom.slice('contract.'.length))
    : slidesFrom.startsWith('state.')
      ? readByPath(ctx.state, slidesFrom.slice('state.'.length))
      : undefined;
  let visualRaw = visualFrom.startsWith('contract.')
    ? readByPath(contract, visualFrom.slice('contract.'.length))
    : visualFrom.startsWith('state.')
      ? readByPath(ctx.state, visualFrom.slice('state.'.length))
      : undefined;
  if (!visualRaw) {
    visualRaw =
      readByPath(contract, 'basic.visual_system') ?? readByPath(contract, 'business.visual_system');
  }
  const titleRaw = titleFrom.startsWith('contract.')
    ? readByPath(contract, titleFrom.slice('contract.'.length))
    : titleFrom.startsWith('state.')
      ? readByPath(ctx.state, titleFrom.slice('state.'.length))
      : undefined;

  const slides = normalizeSlides(slidesRaw, maxPages);
  const title =
    (typeof titleRaw === 'string' && titleRaw.trim()) ||
    String((contract.basic as { title?: string } | undefined)?.title ?? '').trim() ||
    '演示文稿';
  const visual_system =
    visualRaw && typeof visualRaw === 'object' && !Array.isArray(visualRaw)
      ? (visualRaw as DeckVisualSystem)
      : ({
          palette: {
            background: '#0F172A',
            foreground: '#F8FAFC',
            accent: '#38BDF8',
            muted: '#94A3B8',
          },
          ratio: '16:9',
        } satisfies DeckVisualSystem);

  if (slides.length === 0) {
    const msg = 'renderPptx：slides 为空';
    if (soft) return failSoft(ctx, msg, slides, title);
    throw new ConfigurationError(msg);
  }

  const userId = ctx.userId;
  if (!userId) {
    const msg = 'renderPptx：缺少 userId';
    if (soft) return failSoft(ctx, msg, slides, title);
    throw new ConfigurationError(msg);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxm-pptx-'));
  const inputPath = path.join(tmpDir, 'deck.json');
  const outputPath = path.join(tmpDir, 'deck.pptx');
  const deckPayload = {
    title,
    visual_system,
    slides,
  };

  try {
    let buf: Buffer;
    if (isPptxCompilerApiConfigured()) {
      // 异步 HTTP job：服务端线程池并发编译；本 step 只轮询，不 spawn Python
      buf = await compileDeckViaApi({
        title,
        visual_system: visual_system as Record<string, unknown>,
        slides,
        meta: {
          userId,
          taskId: ctx.taskId ?? null,
          scope: ctx.scope,
          taskKey: ctx.taskKey,
          subtype: ctx.subtype,
        },
      });
    } else {
      // 本地兜底（开发机未起编译服务时）
      await fs.writeFile(inputPath, JSON.stringify(deckPayload, null, 2), 'utf-8');
      await runCompiler(inputPath, outputPath);
      buf = await fs.readFile(outputPath);
    }
    if (buf.length < 64) {
      throw new Error('PPTX 文件过小，可能编译失败');
    }

    const bucket = getGeneratedBucket();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 8);
    const key = `${userId}/writing/${timestamp}-${randomId}.pptx`;
    const storageRepo = RepositoryFactory.createStorageRepository();
    await storageRepo.uploadFile(bucket, key, buf, {
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      metadata: {
        userId,
        format: 'pptx',
        slideCount: String(slides.length),
      },
    });
    const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 3600);
    const presentationStorage: PresentationStorageInfo = {
      key,
      bucket,
      url,
    };

    const outline = assembleDeckOutlineMarkdown({
      title,
      deckType: String(
        (contract.basic as { usage_direction?: string; deck_type?: string } | undefined)
          ?.usage_direction ??
          (contract.basic as { deck_type?: string } | undefined)?.deck_type ??
          ''
      ),
      slides,
    });
    const prevCore = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? {};
    const prevMeta = (prevCore.metadata as Record<string, unknown> | undefined) ?? {};
    const text =
      typeof prevCore.text === 'string' && String(prevCore.text).trim()
        ? String(prevCore.text)
        : outline;

    return {
      ...ctx,
      state: {
        ...ctx.state,
        presentationStorage,
        renderPptxStatus: 'ok',
        renderPptxStorage: presentationStorage,
        coreArtifact: {
          kind: 'text',
          text,
          metadata: {
            ...prevMeta,
            mxmWarp: true,
            resultKind: 'presentation-deck',
            presentationStorage,
            presentationRenderStatus: 'ok',
            presentationSlideCount: slides.length,
          },
        },
        finalArtifact: {
          kind: 'text',
          text,
          metadata: {
            ...prevMeta,
            mxmWarp: true,
            resultKind: 'presentation-deck',
            presentationStorage,
            presentationRenderStatus: 'ok',
            presentationSlideCount: slides.length,
          },
        },
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (soft) return failSoft(ctx, msg, slides, title);
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
