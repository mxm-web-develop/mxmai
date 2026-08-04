/**
 * 平台锁定的 generator / group / series 调用脚本（只读，供 Admin 展示与文档化）
 * 运行时由 executor 按 taskKey 走对应平台路径，不 eval 此文件。
 */

export function buildInvokeScriptSource(taskKey: 'generator' | 'group' | 'series'): string {
  if (taskKey === 'group') {
    return `/**
 * @readonly platform invoke-group
 * Output skill entry for taskKey=group.
 * Runtime: warp-runner → groupItemBatch (+ itemManuscript from SKILL.md) → assembleGroupText.
 * Do not edit; concurrency / itemsFrom stay in taskTemplate.extra.groupOutput.
 */
export const invokeMode = 'group';
export const steps = ['groupItemBatch', 'assembleGroupText'];
export default { invokeMode, steps };
`;
  }
  if (taskKey === 'series') {
    return `/**
 * @readonly platform invoke-series
 * Output skill entry for taskKey=series (history-aware single generate).
 * Runtime: skill LLM with series context → coreArtifact (writing) or speech route (audio).
 * Do not edit.
 */
export const invokeMode = 'series';
export const steps = ['skillLlm', 'scopePrimaryGenerate'];
export default { invokeMode, steps };
`;
  }
  return `/**
 * @readonly platform invoke-generator
 * Output skill entry for taskKey=generator.
 * Runtime: load SKILL.md + references → LLM (unless skipOutputLlm) → coreArtifact;
 * media scopes may then call speech / graph / music primary APIs outside this text step.
 * Do not edit.
 */
export const invokeMode = 'generator';
export const steps = ['skillLlm', 'scopePrimaryGenerate'];
export default { invokeMode, steps };
`;
}

/** text 子业务无 generator 三态时用通用 invoke 说明 */
export function buildTextInvokeScriptSource(): string {
  return `/**
 * @readonly platform invoke for text skill
 * Runtime: nestedText / runTaskV2(scope=text) → skill executor → sync text result.
 * Do not edit.
 */
export const invokeMode = 'text';
export const steps = ['skillLlm'];
export default { invokeMode, steps };
`;
}
