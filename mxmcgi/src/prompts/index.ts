/**
 * 提示词工程入口
 * 按业务 key 解析 rules / outputFormat，供 writing、graph 等使用
 */

export {
  getWritingRulesAndFormatResolved,
  getGraphRulesResolved,
  getPromptFullConfig,
  type PromptFullConfig,
} from './resolver';
export { assemblePrompt, type AssemblePromptOptions } from './assemble';
