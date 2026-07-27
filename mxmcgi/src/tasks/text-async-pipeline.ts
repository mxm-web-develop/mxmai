/**
 * text scope 异步任务判定（带 post pipeline 的业务不走同步 HTTP）
 */
import type { TaskTemplate } from "./types";
import { mergeEffectivePipeline } from "./business-pipeline-defaults";

export function textScopeNeedsAsyncTask(
  template: TaskTemplate,
  scope: string,
  rowExtra?: Record<string, unknown> | null
): boolean {
  const { post } = mergeEffectivePipeline(scope, template, rowExtra ?? null);
  return post.length > 0;
}
