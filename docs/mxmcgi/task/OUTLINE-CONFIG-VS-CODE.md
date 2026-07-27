# 大纲生成：配置与写死逻辑说明

## v2 与老逻辑完全分离（不兼容老逻辑）

- **v2**（`POST /api/v2/tasks/run`）：**仅**使用 TaskTemplate 拼好的 `params.prompt`（system + user + outputFormat），**绝不**拼接 writing-service 里的结构类型、节点格式、时长节奏等老逻辑。task-engine 固定传 `useConfiguredPrompt: true`，writing-task 原样传给 `generateOutline`；`generateOutline` 仅在 `useConfiguredPrompt === true` 时用 `params.prompt`，否则才走老接口分支。
- **老接口**（如 `POST /api/v1/writing/outline`）：不传 `useConfiguredPrompt`，走 writing-service 内手写拼接（结构类型、节点字段说明、口播/分镜规则等）。v2 不兼容、也不复用这段逻辑。

---

## 结论（先看这里）

- **v2 路径**（`useConfiguredPrompt: true`）：只使用 TaskTemplate 里的 `systemTemplate`、`userTemplate`、`outputFormatTemplate`，**没有任何写死的节点格式或结构类型**。要得到你看到的那种带 `tone`、`stance`、`motivation`、`key_elements`、`length` 的大纲，必须在 **outputFormatTemplate** 里明确写出「每个节点可包含哪些字段」。
- **非 v2 路径**（老接口，如 `POST /api/v1/writing/outline`）：`writing-service.ts` 里会**写死**结构类型模板、节点字段说明、JSON 示例等；所以你看到的那种「富节点」大纲，是老逻辑里硬编码的 prompt 带来的。

---

## 1. 非 v2 路径：写死逻辑在哪里

当 **未** 使用 v2（即没有 `params.useConfiguredPrompt` 或为 false）时，大纲 prompt 在 **mxmcgi/src/core/writing/writing-service.ts** 的 `generateOutline` / `generateOutlineStream` 中**手写拼接**，主要包括：

| 内容 | 位置 | 说明 |
|------|------|------|
| 结构类型模板（IMRaD、三段式等） | `getStructurePromptTemplate(params.outline_structure_type, lang)`，来自 **outline-structure-types.ts** | 根据 `outline_structure_type` 注入对应中/英模板 |
| 节点字段说明 | 同文件内拼接的「每个节点需要包含：content、motivation、length、key_elements…」及 stance/tone/cast 等 | 明确要求模型输出 `tone`、`stance`、`motivation`、`key_elements`、`length` 等 |
| 字数/时长/深度等约束 | 同文件内根据 `applyto`、`total_textcount`、`total_duration_seconds` 等拼接 | 控制篇幅与层级 |
| 角色（cast）说明 | 有角色时注入「参演角色」与 cast 字段说明 | 分镜/口播等多角色场景 |
| 最终 JSON 示例 | 同文件内写死的 `{"uid":"...","content":"...","children":[...]}` 示例 | 只给出最简结构，具体节点字段靠上面「节点字段说明」约束 |

也就是说：**你看到的那种「大纲结构数据」（含 tone、stance、motivation、key_elements、length）是由这段写死的 prompt 规定出来的，配置里没有对应项。**

---

## 2. v2 路径：完全由配置决定

v2 走 **task-engine → prompt-template.renderPromptFromTemplate**，只做三件事：

1. 用表单参数插值 `systemTemplate`、`userTemplate`、`outputFormatTemplate`
2. 拼成：`system + 【用户需求】user + 【输出要求】outputFormat`
3. 把整段 `finalPrompt` 交给 `generateOutline`；此时 `params.useConfiguredPrompt === true`，**不再**在 writing-service 里做任何上述拼接

因此：

- **结构类型**（IMRaD、三段式等）：若要在 v2 里生效，必须在 **systemTemplate**（或 userTemplate）里自己写清，或把 `outline-structure-types.ts` 里对应模板内容复制到配置中。
- **节点字段**（tone、stance、motivation、key_elements、length 等）：只有在 **outputFormatTemplate** 里写清楚「每个节点可/必须包含哪些字段」，模型才会稳定输出这些字段；否则配置里只有 `uid、content、children` 时，v2 不会主动加「富节点」说明。

当前仓库里的默认/示例 **outputFormatTemplate** 只写了最简格式，例如：

```text
字段格式：{"uid": string, "content": string, "children": []}
```

所以 v2 默认**没有**对应「富节点」的配置逻辑；要和你看到的大纲结构数据一致，需要把 outputFormatTemplate 改成下面「推荐写法」那样，把节点字段写全。

---

## 3. 推荐：在配置里写全节点结构（v2）

在 **业务管理 → 对应大纲任务 → outputFormatTemplate** 中，建议至少包含：

- 只输出最终大纲 JSON，不要 markdown 代码块。
- 根节点与子节点**字段格式**写全，例如：
  - 必选：`uid`、`content`、`children`
  - 可选（与 type.ts `Outline` 一致）：`motivation`、`stance`、`tone`、`length`、`key_elements`（数组）、`cast`（string 数组）等。
- 要求返回完整 JSON，不要额外解释文字。

这样 v2 就**完全由配置驱动**，和当前「富节点」大纲结构数据一致，且不再依赖 writing-service 里那套写死逻辑。示例见仓库中的 **writing-outlines-tech-article.taskTemplate.json** 的 `outputFormatTemplate` 及脚本 **update-outlines-form-schema.ts** 中的默认模板。

---

## 4. 小结

| 问题 | 答案 |
|------|------|
| 配置里有没有「节点 tone / stance / motivation 等」的逻辑？ | v2 下**没有**，除非你在 outputFormatTemplate（或 systemTemplate）里自己写。 |
| 写死的内容在哪？ | **writing-service.ts** 中当 `useConfiguredPrompt` 不为 true 时的整段大纲 prompt 拼接；以及 **outline-structure-types.ts** 中的结构类型模板。 |
| 如何让 v2 也产出同样的富节点大纲？ | 在 Admin 的该任务的 **outputFormatTemplate** 中写明完整节点字段（uid、content、children、motivation、length、stance、tone、key_elements 等），与 type.ts 的 `Outline` 一致。 |
