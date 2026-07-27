# Task v2 固定前置链（实现说明）

## 执行顺序（`runTaskV2`）

1. `loadTaskDefinition` → `validateWithJsonSchema`
2. `runFixedTaskV2Prelude`（[`task-v2-prelude.ts`](./task-v2-prelude.ts)）
   - `sensitiveCheck`：检查 `params.prompt`（与原先 `inputPipeline` 默认一致）
   - **`resolveContextFields`**（`scope=writing|outline`）：对 formSchema 中 `x-ui-type: kbRecall | webSearch` 字段并行召回/检索，结果格式化为字符串写回 `params[fieldName]`，供 unifiedTemplate 插值
   - `knowledgeRetrieve`：当且仅当 `template.knowledge?.useKnowledge === true` 且 `defaultKnowledgeBaseIds` 非空时执行（旧业务）；召回结果写入 `state.enhancedPrompt` 时，会 **合并进 `params.prompt`**
3. `renderPromptFromTemplate`
4. `finalPromptEnhanced`：`state.finalPrompt` 优先，否则为渲染结果
5. 余额预检 → `createTask` → `executeTask`

## 单模板 `unifiedTemplate`（可选）

- 若 `prompt.unifiedTemplate` 非空，[`renderPromptFromTemplate`](./prompt-template.ts) **只对该字符串做 `${var}` 插值**，整段即为 `finalPrompt`，**不再**拼接 system / user / output 与 `【用户需求】` 等标题。
- 表单 `formSchema` 与请求 `params` 不变；与三段式二选一（优先 unified）。

## 已废弃配置

- `TaskTemplate.inputPipeline` / `outputPipeline`：**不再读取**；保存业务配置时 Admin 会剥离这两项。旧库内残留字段可忽略，下次保存即去除。

## 生图 text 模式（graph）

- 配置：`prompt_engineering_config.extra.prompt_text_mode`（经 `getPromptFullConfig` 暴露为 `prompt_text_mode`）
- 当前仅支持 **`basic`**（默认），行为同原 `runBasicText('writing-basic-text', …)`
- 其它取值：**显式报错**，预留后续 Smartflow

详见 [`../core/graph/graph-prompt-text.ts`](../core/graph/graph-prompt-text.ts)。
