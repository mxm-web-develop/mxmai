/**
 * 管线步骤：assembleGroupText — 把 group 数组项中的成稿字段确定性拼成一份 Markdown。
 * 不调用 LLM，避免 output JSON 模式把合同/variants 原样吐进「内容」。
 *
 * params:
 * - itemsFrom:     默认 contract.business.variants
 * - textField:     成稿字段名，默认 manuscript
 * - titleFrom:     文档总标题路径，默认 contract.basic.topic
 * - headingTemplate: 默认 "## ${item.piece_label}"（篇名片：文章标题 · 文风）
 * - introTemplate: 可选导语（支持 ${contract.basic.topic} 等）
 */
import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import { resolveGroupItemTemplate } from './group-item-batch-step';
import {
  getSeekVoicePreset,
  pickI18n,
} from './writing-style-presets/seek-voice-presets';

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function readItems(ctx: TaskContext, itemsFrom: string): Record<string, unknown>[] {
  const path = itemsFrom.trim();
  let raw: unknown;
  if (path.startsWith('contract.')) {
    raw = readByPath(ctx.state.contract, path.slice('contract.'.length));
  } else if (path.startsWith('state.')) {
    raw = readByPath(ctx.state, path.slice('state.'.length));
  } else if (path.startsWith('params.')) {
    raw = readByPath(ctx.params, path.slice('params.'.length));
  } else {
    throw new ConfigurationError(
      `assembleGroupText.itemsFrom 须以 contract. / state. / params. 开头，收到：${itemsFrom}`
    );
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (it): it is Record<string, unknown> => !!it && typeof it === 'object' && !Array.isArray(it)
  );
}

/** 从 Markdown 成稿抽首个一级标题 */
export function extractManuscriptTitle(md: string): string {
  const m = String(md || '').match(/^\s*#\s+(.+?)\s*$/m);
  if (!m?.[1]) return '';
  return m[1]
    .replace(/^【|】$/g, '')
    .replace(/^「|」$/g, '')
    .replace(/^『|』$/g, '')
    .trim();
}

function resolveVoiceStyleLabel(item: Record<string, unknown>, lang: string): string {
  const explicit = String(
    item.voice_label ?? item.style_label ?? item.voice_name ?? ''
  ).trim();
  if (explicit) return explicit;
  const voiceId = String(item.voice_id ?? '').trim();
  if (voiceId) {
    const preset = getSeekVoicePreset(voiceId);
    const label = pickI18n(preset?.label, lang).trim();
    if (label) return label;
  }
  const blurb = String(item.voice_blurb ?? '').trim();
  if (blurb) return blurb.length > 16 ? `${blurb.slice(0, 14)}…` : blurb;
  return String(item.name ?? item.genre_label ?? '').trim();
}

/** 篇名片：文章标题 · 文风（供侧栏 / 集合条目） */
export function buildPieceDisplayLabel(opts: {
  manuscript?: string;
  item: Record<string, unknown>;
  index: number;
  lang?: string;
}): { articleTitle: string; styleLabel: string; pieceLabel: string } {
  const lang = opts.lang || 'zh';
  const fromMs = extractManuscriptTitle(opts.manuscript || '');
  const fromFields = String(
    opts.item.report_title ?? opts.item.article_title ?? opts.item.title ?? ''
  ).trim();
  // 忽略旧占位「路线 N」
  const cleanedField =
    fromFields && !/^(路线|第)\s*\d+(\s*路)?$/.test(fromFields) ? fromFields : '';
  const articleTitle = fromMs || cleanedField;
  const styleLabel = resolveVoiceStyleLabel(opts.item, lang);
  if (articleTitle && styleLabel) {
    return {
      articleTitle,
      styleLabel,
      pieceLabel: `${articleTitle} · ${styleLabel}`,
    };
  }
  if (articleTitle) {
    return { articleTitle, styleLabel, pieceLabel: articleTitle };
  }
  if (styleLabel) {
    return { articleTitle, styleLabel, pieceLabel: styleLabel };
  }
  return {
    articleTitle: '',
    styleLabel: '',
    pieceLabel: `探索稿 ${opts.index + 1}`,
  };
}

function writeEnrichedVariants(
  ctx: TaskContext,
  itemsFrom: string,
  enrichedItems: Record<string, unknown>[]
): TaskContext {
  if (!itemsFrom.startsWith('contract.')) return ctx;
  const contract =
    ctx.state.contract && typeof ctx.state.contract === 'object'
      ? ({ ...(ctx.state.contract as Record<string, unknown>) } as Record<string, unknown>)
      : null;
  if (!contract) return ctx;

  const business =
    contract.business && typeof contract.business === 'object'
      ? { ...(contract.business as Record<string, unknown>) }
      : {};
  const sub = itemsFrom.slice('contract.'.length);
  const segs = sub.split('.').filter(Boolean);
  if (segs.length === 1) {
    business[segs[0]!] = enrichedItems;
    contract.business = business;
  } else if (segs[0] === 'business' && segs.length === 2) {
    business[segs[1]!] = enrichedItems;
    contract.business = business;
  } else {
    return ctx;
  }
  return { ...ctx, state: { ...ctx.state, contract: contract as never } };
}

export async function runAssembleGroupTextStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const itemsFrom = String(params.itemsFrom ?? 'contract.business.variants').trim();
  const textField = String(params.textField ?? 'manuscript').trim() || 'manuscript';
  const titleFrom = String(params.titleFrom ?? 'contract.basic.topic').trim();
  const headingTemplate =
    String(params.headingTemplate ?? '## ${item.piece_label}').trim() ||
    '## ${item.piece_label}';
  const introTemplate =
    typeof params.introTemplate === 'string' ? params.introTemplate.trim() : '';

  const items = readItems(ctx, itemsFrom);
  if (items.length === 0) {
    throw new ConfigurationError(`assembleGroupText：${itemsFrom} 为空或不是对象数组`);
  }

  const titleRaw = titleFrom.startsWith('contract.')
    ? readByPath(ctx.state.contract, titleFrom.slice('contract.'.length))
    : titleFrom.startsWith('params.')
      ? readByPath(ctx.params, titleFrom.slice('params.'.length))
      : titleFrom;
  const title = String(titleRaw ?? ctx.params.topic ?? '多路探索').trim() || '多路探索';
  const lang = String(
    readByPath(ctx.state.contract, 'basic.language') ?? ctx.params.language ?? 'zh'
  ).trim();

  const parts: string[] = [`# 「${title}」多路写作探索`, ''];
  if (introTemplate) {
    const intro = String(resolveGroupItemTemplate(ctx, {}, 0, items.length, introTemplate)).trim();
    if (intro) parts.push(intro, '');
  }

  let ready = 0;
  const collectionItems: Array<{
    id: string;
    order: number;
    title: string;
    name?: string;
    angle?: string;
    status: 'ready' | 'failed';
    error?: string;
    textPreview?: string;
    manuscript?: string;
  }> = [];

  const enrichedItems = items.map((item, i) => {
    const body = String(item[textField] ?? '').trim();
    const display = buildPieceDisplayLabel({
      manuscript: body,
      item,
      index: i,
      lang,
    });
    return {
      ...item,
      article_title: display.articleTitle || undefined,
      voice_label: display.styleLabel || undefined,
      piece_label: display.pieceLabel,
    };
  });

  ctx = writeEnrichedVariants(ctx, itemsFrom, enrichedItems);

  for (let i = 0; i < enrichedItems.length; i++) {
    const item = enrichedItems[i]!;
    const heading = String(
      resolveGroupItemTemplate(ctx, item, i, enrichedItems.length, headingTemplate)
    ).trim();
    const body = String(item[textField] ?? '').trim();
    const angle = String(item.angle ?? '').trim();
    const pieceLabel = String(item.piece_label ?? '').trim();
    const pieceId = String(item.id ?? `v${i + 1}`).trim() || `v${i + 1}`;
    parts.push(heading || `## ${pieceLabel || `探索稿 ${i + 1}`}`);
    if (angle) parts.push(`> ${angle}`, '');
    if (body) {
      parts.push(body, '', '---', '');
      ready += 1;
      collectionItems.push({
        id: pieceId,
        order: i,
        // 侧栏主标题：文章标题 · 文风
        title: pieceLabel || `探索稿 ${i + 1}`,
        name: undefined,
        angle: angle || undefined,
        status: 'ready',
        textPreview: body.replace(/\s+/g, ' ').trim().slice(0, 160),
        manuscript: body,
      });
    } else {
      parts.push(`（本路成稿未生成${pieceLabel ? `：${pieceLabel}` : ''}）`, '', '---', '');
      collectionItems.push({
        id: pieceId,
        order: i,
        title: pieceLabel || `探索稿 ${i + 1}`,
        name: undefined,
        angle: angle || undefined,
        status: 'failed',
        error: '成稿未生成',
      });
    }
  }

  if (ready === 0) {
    throw new Error(
      `assembleGroupText：${items.length} 路均无 ${textField} 成稿（请确认 groupItemBatch.itemManuscript 已执行）`
    );
  }

  while (parts.length && (parts[parts.length - 1] === '' || parts[parts.length - 1] === '---')) {
    parts.pop();
  }
  const text = parts.join('\n').trim() + '\n';
  const failed = items.length - ready;
  const collectionResult = {
    collectionId: String(ctx.taskId ?? ''),
    title,
    itemCount: items.length,
    items: collectionItems,
  };

  return {
    ...ctx,
    state: {
      ...ctx.state,
      groupAssembledText: text,
      writingCollectionResult: collectionResult,
      coreArtifact: {
        kind: 'text',
        text,
        metadata: {
          mxmWarp: true,
          assembledFromGroup: true,
          resultKind: 'writing-collection',
          collectionTitle: title,
          collectionItemCount: items.length,
          collectionReadyCount: ready,
          collectionFailedCount: failed,
          collectionResult,
          groupPieceCount: items.length,
          groupReadyCount: ready,
        },
      },
    },
  };
}
