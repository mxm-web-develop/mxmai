/**
 * 管线步骤：validateAlbumSpec — 规范化 params.album_spec → state.albumSpec
 */
import type { PipelineStep, TaskContext } from '../../../tasks/types';
import { normalizeAlbumSpec, parseAlbumSpecInput } from './album-spec';

function resolveMaxItems(ctx: TaskContext, step: PipelineStep): number | undefined {
  const fromStep = Number(step.params?.maxItems);
  if (Number.isFinite(fromStep) && fromStep > 0) return Math.floor(fromStep);
  const fromParams = Number(ctx.params.max_items);
  if (Number.isFinite(fromParams) && fromParams > 0) return Math.floor(fromParams);
  return undefined;
}

export async function runValidateAlbumSpecStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const bpsSpec = ctx.state.albumSpec;
  const raw =
    bpsSpec ??
    ctx.params.album_spec ??
    (ctx.state.nestedTextLast as { text?: string } | undefined)?.text ??
    (ctx.state.finalArtifact as { text?: string } | undefined)?.text;

  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    throw new Error('validateAlbumSpec：缺少 album_spec');
  }

  const parsed = typeof raw === 'string' ? parseAlbumSpecInput(raw) : raw;
  // nestedText 有时输出整包带 markdown；若已是对象直接用
  const spec = normalizeAlbumSpec(parsed, { maxItems: resolveMaxItems(ctx, step) });
  const albumSpecJson = JSON.stringify(spec);

  return {
    ...ctx,
    params: {
      ...ctx.params,
      album_spec: spec,
      album_item_count: spec.items.length,
    },
    state: {
      ...ctx.state,
      albumSpec: spec,
      albumSpecJson,
    },
  };
}
