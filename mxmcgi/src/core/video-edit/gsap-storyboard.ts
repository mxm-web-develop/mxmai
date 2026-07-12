import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepoRoot } from '../utils/repo-root';

let _assembler: typeof import('../../../../shared/gsap-storyboard/assemble.mjs') | null = null;

async function loadAssembler() {
  if (_assembler) return _assembler;
  const root = findRepoRoot();
  _assembler = await import(pathToFileURL(join(root, 'shared/gsap-storyboard/assemble.mjs')).href);
  return _assembler;
}

export type NormalizedGsapScene = {
  mxmHtmlContent: string;
  mxmGsapTimeline: string;
  mxmGsapEase: string;
  mxmDuration?: number;
  mxmStoryboard?: unknown;
  mxmRenderMode?: string;
};

/** 解析 LLM 输出：storyboard.scenes[] 或 legacy 单 scene */
export async function normalizeGsapSceneOutput(raw: Record<string, unknown>): Promise<NormalizedGsapScene> {
  const { normalizeGsapSceneOutput: norm } = await loadAssembler();
  return norm(raw) as NormalizedGsapScene;
}

export async function assembleStoryboardFromRaw(raw: Record<string, unknown>) {
  const { assembleStoryboard, validateStoryboard } = await loadAssembler();
  const v = validateStoryboard(raw);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return assembleStoryboard(v.storyboard);
}

export { findRepoRoot };
