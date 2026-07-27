/**
 * 提示词工程入口
 * 按业务 key 解析 outputFormat / extra；正文统一走 `extra.taskTemplate.unifiedTemplate`
 */

export {
  getWritingRulesAndFormatResolved,
  getGraphRulesResolved,
  getPromptFullConfig,
  type PromptFullConfig,
} from './resolver';
export { assemblePrompt, type AssemblePromptOptions } from './assemble';
