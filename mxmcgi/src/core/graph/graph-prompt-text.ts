/**
 * 生图前「text 阶段」模式（prompt_engineering_config.extra.prompt_text_mode）
 * 当前仅实现 basic；planning/format/strategy 等预留，由后续 Smartflow 承接。
 */
import type { PromptFullConfig } from '../../prompts/resolver';

export const DEFAULT_GRAPH_PROMPT_TEXT_MODE = 'basic';

export function resolveGraphPromptTextMode(config: PromptFullConfig | null): string {
  const m = config?.prompt_text_mode?.trim();
  if (!m) return DEFAULT_GRAPH_PROMPT_TEXT_MODE;
  return m;
}

export function assertSupportedGraphPromptTextMode(mode: string): void {
  if (mode !== DEFAULT_GRAPH_PROMPT_TEXT_MODE) {
    throw new Error(
      `生图提示词 text 模式 "${mode}" 尚未支持，请使用 ${DEFAULT_GRAPH_PROMPT_TEXT_MODE}（默认），或等待 Smartflow 接入`
    );
  }
}
