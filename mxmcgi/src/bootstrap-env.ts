/**
 * @deprecated 请使用 loadMonorepoEnv；保留此导出供 mxmcgi 内部兼容
 */
import { loadMonorepoEnv } from '@mxmai/mxmdata';
import { resolveDefaultLlmProvider, resolveDefaultLlmModel } from './config/default-llm';

export function loadMxmcgiEnv(): void {
  loadMonorepoEnv({ service: 'mxmcgi' });
  if (!process.env.DEFAULT_PROVIDER) {
    console.log(
      `[mxmcgi] DEFAULT_PROVIDER 未设置，LLM 默认: ${resolveDefaultLlmProvider()} / ${resolveDefaultLlmModel()}`
    );
  }
}
