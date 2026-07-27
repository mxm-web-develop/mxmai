/**
 * 管线步骤：assembleGroupText — 把 group 数组项中的成稿字段确定性拼成一份 Markdown。
 * 不调用 LLM，避免 output JSON 模式把合同/variants 原样吐进「内容」。
 *
 * params:
 * - itemsFrom:     默认 contract.business.variants
 * - textField:     成稿字段名，默认 manuscript
 * - titleFrom:     文档总标题路径，默认 contract.basic.topic
 * - labelFrom:     每路小标题字段，默认 item.name（也可写死模板）
 * - headingTemplate: 默认 "## 路线 ${index} · ${item.name}"
 * - introTemplate: 可选导语（支持 ${contract.basic.topic} 等）
 */
import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import { resolveGroupItemTemplate } from './group-item-batch-step';

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

export async function runAssembleGroupTextStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const itemsFrom = String(params.itemsFrom ?? 'contract.business.variants').trim();
  const textField = String(params.textField ?? 'manuscript').trim() || 'manuscript';
  const titleFrom = String(params.titleFrom ?? 'contract.basic.topic').trim();
  const headingTemplate =
    String(params.headingTemplate ?? '## 路线 ${index} · ${item.name}').trim() ||
    '## 路线 ${index}';
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const heading = String(resolveGroupItemTemplate(ctx, item, i, items.length, headingTemplate)).trim();
    const body = String(item[textField] ?? '').trim();
    const angle = String(item.angle ?? '').trim();
    const name = String(item.name ?? '').trim();
    const reportTitle = String(item.report_title ?? name ?? '').trim();
    const pieceId = String(item.id ?? `v${i + 1}`).trim() || `v${i + 1}`;
    parts.push(heading || `## 路线 ${i + 1}`);
    if (angle) parts.push(`> ${angle}`, '');
    if (body) {
      parts.push(body, '', '---', '');
      ready += 1;
      collectionItems.push({
        id: pieceId,
        order: i,
        title: reportTitle || `路线 ${i + 1}`,
        name: name || undefined,
        angle: angle || undefined,
        status: 'ready',
        textPreview: body.replace(/\s+/g, ' ').trim().slice(0, 160),
        manuscript: body,
      });
    } else {
      parts.push(`（本路成稿未生成${name ? `：${name}` : ''}）`, '', '---', '');
      collectionItems.push({
        id: pieceId,
        order: i,
        title: reportTitle || name || `路线 ${i + 1}`,
        name: name || undefined,
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
