---
name: mxmai-text-business-bundle
description: SuperMXMai scope=text 业务上架（plan/transform/expert/validation）。固定入参由平台注入；Admin 只编 prompt/subtype/模型。适用于管道 LLM 原子步骤。
---

# Text 子业务 v2（mxmai）

> **对齐**：`docs/mxm-warp-v2-对齐记录.md` §T  
> **命名**：`.cursor/skills/mxmai_business_naming/SKILL.md`  
> **与 writing 区别**：writing 面向用户文稿；**text** 是宿主管道的 LLM 原子步骤。  
> **默认模型（硬约束）**：`routing` **一律** `provider=maxplan` + `model=MiniMax-M3`。**禁止** `deer` / `deepseek-*` / `deerapi`。

## 四档 type（taskKey）

| type | 固定入参 | 输出约定 |
|------|----------|----------|
| `plan` | `contract` + `goal` | 单一 JSON object（内壳由 subtype 定） |
| `transform` | `input` + `instruction` | 格式由 subtype prompt 声明，平台不钉死 |
| `expert` | `contract` + `field_specs` | JSON object，键 ⊆ field_specs；默认可合并 `business` |
| `validation` | `contract` + `rules` | `{ ok: boolean, errors: string[] }`；失败则管道停步 |

**废止**：`format` / `think` / `structure` / `layout`（不做运行时映射）。

## 超长输出截断：`deterministicPolish` 兜底

`transform` 子业务（如 `text/transform/md-format`）在 post 阶段如果输出撞 LLM `maxTokens` 上限（`finish_reason: 'length'`），平台行为：

- 默认：`assertNestedTextOutputComplete` 抛 `ConfigurationError` → 任务 failed。
- 当 `step.params.deterministicPolish === true` 时：自动 fallback——退回入参 `input` + `polishEditorialMarkdown` 机械打磨，写回 `coreArtifact` / `finalArtifact`，任务继续。
- 其它 type（plan / expert / validation）一律保留抛错语义。

配 transform 子业务时建议：

- `generateParams.maxTokens` 留够（`text/transform/md-format` 推荐 65536，超长日报建议 131072）。
- 如输出已结构合规，可加 `params.deterministicPolish: true` 让截断时不阻断任务。

## 硬约束

1. text **无**五段管道；**禁止** text→text 嵌套。
2. formSchema **平台注入**，Admin / bundle 不得自创入参 key。
3. subtype **只改** unifiedTemplate / 显示名 / 模型，不改入参表。
4. nestedText `inputMapping` 只能绑固定键；`expert.field_specs` 可留空由运行时按宿主 schema 空字段生成。

## Prompt 原则（仍适用）

- 用任务角色开场，禁止平台自我介绍。
- 结构化输出：英文键、可 `JSON.parse`、无 Markdown 围栏（除非 subtype 明确要求纯文本）。
- 占位符与固定入参一致：`${contract}` `${goal}` `${input}` `${instruction}` `${field_specs}` `${rules}`。

## Bundle

示范四档：`mxmcgi/src/tasks/examples/text-v2-demos.business.json`

```bash
pnpm --filter mxmcgi exec tsx src/scripts/wipe-local-text-businesses.ts   # 本地清空旧 text
pnpm --filter mxmcgi exec tsx src/scripts/apply-mxm-business-bundle.ts src/tasks/examples/text-v2-demos.business.json
```

`pipeline` 保持空（text 无自管线）；可被其他 scope 嵌套调用，无需「内部业务」标记。

## 自检

- [ ] type ∈ plan|transform|expert|validation
- [ ] 入参键与上表一致
- [ ] **routing = maxplan / MiniMax-M3**（禁止 deer）
- [ ] 无 text 自管线
- [ ] validation 输出形状正确
- [ ] transform 节点：明确是否需要 `deterministicPolish` 兜底
- [ ] 本地已 wipe + apply 示范（如需）
