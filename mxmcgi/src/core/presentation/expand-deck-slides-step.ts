/**
 * 确定性：按选定方案展开 contract.business.slides 骨架。
 * 平台 step：expandDeckSlides
 */
import type { PipelineStep, TaskContext } from '../../tasks/types';
import { ConfigurationError } from '../../tasks/errors';
import {
  clampDeckPageCount,
  DEFAULT_MAX_DECK_PAGES,
  expandSlidesSkeleton,
  type DeckPlanRecommendItem,
  type DeckSlideIr,
} from './deck-ir';

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function writeByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.').filter(Boolean);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    const next = cur[seg];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

function pickSelectedPlan(
  basic: Record<string, unknown>,
  plans: unknown
): DeckPlanRecommendItem | null {
  const fromBasic = basic.selected_plan;
  if (fromBasic && typeof fromBasic === 'object' && !Array.isArray(fromBasic)) {
    return fromBasic as DeckPlanRecommendItem;
  }
  const planId = String(basic.plan_id ?? '').trim();
  if (!planId || !Array.isArray(plans)) return null;
  const hit = plans.find(
    (p) => p && typeof p === 'object' && String((p as { id?: unknown }).id ?? '') === planId
  );
  return hit && typeof hit === 'object' ? (hit as DeckPlanRecommendItem) : null;
}

export async function runExpandDeckSlidesStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const contract =
    ctx.state.contract && typeof ctx.state.contract === 'object'
      ? (ctx.state.contract as Record<string, unknown>)
      : null;
  if (!contract) {
    throw new ConfigurationError('expandDeckSlides：缺少 state.contract');
  }

  const basic =
    contract.basic && typeof contract.basic === 'object' && !Array.isArray(contract.basic)
      ? ({ ...(contract.basic as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const plansPath = String(params.plansFrom ?? 'contract.business.plans').trim();
  let plans = plansPath.startsWith('contract.')
    ? readByPath(contract, plansPath.slice('contract.'.length))
    : plansPath.startsWith('state.')
      ? readByPath(ctx.state, plansPath.slice('state.'.length))
      : undefined;
  // C 端预览写入 params.plans 且跳过 nestedText 时，从 params 回填
  if ((!Array.isArray(plans) || plans.length === 0) && Array.isArray(ctx.params?.plans)) {
    plans = ctx.params.plans;
  }

  const selected = pickSelectedPlan(basic, plans);
  const roles =
    (selected?.slide_roles as string[] | undefined) ??
    (Array.isArray(basic.slide_roles) ? (basic.slide_roles as string[]) : undefined);
  const pageCount = clampDeckPageCount(
    selected?.page_count ?? basic.page_count ?? roles?.length ?? 10,
    10
  );
  const maxPages = clampDeckPageCount(params.maxPages ?? DEFAULT_MAX_DECK_PAGES, DEFAULT_MAX_DECK_PAGES);

  const slides: DeckSlideIr[] = expandSlidesSkeleton({
    slideRoles: roles,
    pageCount,
    maxPages,
  });

  if (selected) {
    basic.selected_plan = selected;
    basic.plan_id = selected.id ?? basic.plan_id;
    basic.page_count = pageCount;
    if (selected.density) basic.density = selected.density;
  } else {
    basic.page_count = pageCount;
  }

  const business =
    contract.business && typeof contract.business === 'object' && !Array.isArray(contract.business)
      ? ({ ...(contract.business as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  business.slides = slides;
  if (Array.isArray(plans) && plans.length > 0 && !Array.isArray(business.plans)) {
    business.plans = plans;
  }

  const nextContract = { ...contract, basic, business };
  const slidesToPath = String(params.slidesTo ?? 'contract.business.slides').trim();
  if (slidesToPath.startsWith('contract.')) {
    writeByPath(nextContract, slidesToPath.slice('contract.'.length), slides);
  }

  return {
    ...ctx,
    state: {
      ...ctx.state,
      contract: nextContract,
      deckSlidesExpanded: true,
      deckSlideCount: slides.length,
    },
  };
}
