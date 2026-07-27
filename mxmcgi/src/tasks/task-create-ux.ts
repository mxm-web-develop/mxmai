/**
 * 判断业务是否用 pre/enrich 交互闸门采集表单（C 端不渲染长 Schema）
 */
import type { BusinessPipelineConfig, JsonSchemaV2, PipelineStep } from './types';

function stepIsInteractiveGate(step: PipelineStep | undefined): boolean {
  if (!step) return false;
  if (step.step === 'interactiveCard') return true;
  if (step.step !== 'manualReview') return false;
  const kind = step.params?.kind;
  return kind === 'interactive-card' || kind === 'basic-form';
}

export function pipelineHasInteractiveGates(
  pipeline: BusinessPipelineConfig | undefined | null
): boolean {
  if (!pipeline) return false;
  const phases = [pipeline.pre, pipeline.enrich];
  for (const steps of phases) {
    if (!Array.isArray(steps)) continue;
    if (steps.some(stepIsInteractiveGate)) return true;
  }
  return false;
}

/** C 端创建 UX：schema-form 一次填表；warp-gates 空参开任务后分步闸门 */
export type TaskCreateUx = 'schema-form' | 'warp-gates';

export function resolveTaskCreateUx(
  pipeline: BusinessPipelineConfig | undefined | null,
  formSchema?: JsonSchemaV2 | null
): TaskCreateUx {
  if (pipelineHasInteractiveGates(pipeline)) return 'warp-gates';
  const root = formSchema as Record<string, unknown> | null | undefined;
  if (root?.['x-createUx'] === 'warp-gates' || root?.['x-create-ux'] === 'warp-gates') {
    return 'warp-gates';
  }
  const props = (formSchema?.properties ?? {}) as Record<string, unknown>;
  if (props.industry && props.date_mode && props.core_topic) return 'warp-gates';
  return 'schema-form';
}
