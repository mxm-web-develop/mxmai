import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepoRoot } from '../utils/repo-root';
import type { TimelineVisualSegment } from './timeline-segment-types';

type GsapShared = typeof import('../../../../shared/gsap-storyboard/assemble.mjs') &
  typeof import('../../../../shared/gsap-storyboard/shot-list-context.mjs') &
  typeof import('../../../../shared/gsap-storyboard/scene-selector.mjs');

let _shared: GsapShared | null = null;

async function loadShared(): Promise<GsapShared> {
  if (_shared) return _shared;
  const root = findRepoRoot();
  const [assemble, ctx, selector, router] = await Promise.all([
    import(pathToFileURL(join(root, 'shared/gsap-storyboard/assemble.mjs')).href),
    import(pathToFileURL(join(root, 'shared/gsap-storyboard/shot-list-context.mjs')).href),
    import(pathToFileURL(join(root, 'shared/gsap-storyboard/scene-selector.mjs')).href),
    import(pathToFileURL(join(root, 'shared/gsap-storyboard/topic-router.mjs')).href),
  ]);
  _shared = { ...assemble, ...ctx, ...selector, ...router } as GsapShared;
  return _shared;
}

/** nestedText video-shot-list 前置：注入风格路由 + scene catalog */
export async function buildShotListGsapParams(input: {
  topic?: string;
  edit_style?: string;
  supplement?: string;
  voiceover_subtitles_json?: string;
}): Promise<Record<string, unknown>> {
  const { buildShotListGsapContext } = await loadShared();
  return buildShotListGsapContext(input);
}

export type AssembledGsapClip = {
  mxmHtmlContent: string;
  mxmGsapTimeline: string;
  mxmGsapEase: string;
  mxmDuration?: number;
};

/** 有结构化 scene 字段时直接组装，否则走 LLM brief */
export async function assembleGsapClipFromSegment(
  segment: TimelineVisualSegment,
  opts: { aspectRatio?: string; defaultStyleId?: string }
): Promise<AssembledGsapClip | null> {
  if (segment.mxmGsapSceneType && segment.mxmGsapStyleId) {
    const { assembleSingleScene } = await loadShared();
    const duration = Math.max(1, Math.round(segment.endSeconds - segment.startSeconds));
    return assembleSingleScene({
      styleId: segment.mxmGsapStyleId,
      sceneType: segment.mxmGsapSceneType,
      data: segment.mxmGsapSceneData ?? {},
      duration,
      aspectRatio: opts.aspectRatio,
    });
  }
  return null;
}

/** shot-list 解析后补全缺失的 GSAP 结构化字段 */
export async function enrichGsapTimelineSegments(
  segments: TimelineVisualSegment[],
  opts: { topic?: string; editStyle?: string; defaultStyleId?: string }
): Promise<TimelineVisualSegment[]> {
  const { routeTopic, suggestSceneType, buildDefaultSceneData } = await loadShared();
  const routing = routeTopic({ topic: opts.topic, editStyle: opts.editStyle });
  const defaultStyleId = opts.defaultStyleId || routing.styleId;
  const gsapSegs = segments.filter((s) => s.mxmRenderMode === 'gsap-html-animation');
  const usedTypes: string[] = [];
  let gsapIndex = 0;

  return segments.map((seg) => {
    if (seg.mxmRenderMode !== 'gsap-html-animation') return seg;

    const styleId = seg.mxmGsapStyleId || defaultStyleId;
    let sceneType = seg.mxmGsapSceneType;
    const idx = gsapIndex++;
    if (!sceneType) {
      sceneType = suggestSceneType({
        voiceoverText: seg.mxmVoiceoverText || seg.text,
        visualText: seg.text,
        index: idx,
        total: gsapSegs.length,
        usedTypes,
      });
    }
    usedTypes.push(sceneType);

    const sceneData =
      seg.mxmGsapSceneData ??
      buildDefaultSceneData(sceneType, {
        voiceoverText: seg.mxmVoiceoverText || seg.text,
        visualText: seg.text,
        topic: opts.topic,
        index: idx,
        keywords: seg.keywords,
      });

    return {
      ...seg,
      mxmGsapStyleId: styleId,
      mxmGsapSceneType: sceneType,
      mxmGsapSceneData: sceneData,
    };
  });
}

export { findRepoRoot };
