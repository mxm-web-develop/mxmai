# md-format 截断自动 fallback（deterministicPolish 兜底）

## 背景

日报写作 post 阶段调用 `text/transform/md-format` 做"Markdown 抛光"。如果成稿本身超长 + transform 自带超长 instruction，超出 LLM `maxTokens` 上限后会被 `finish_reason: 'length'` 截断，`assertNestedTextOutputComplete` 直接抛 `ConfigurationError`，任务被 task-executor 标 `failed`。前端列表显示「nestedText「text/transform/md-format」输出因 max_tokens 上限被截断（completion_tokens=8192）。请在 Admin 提高 generateParams.maxTokens（M3 建议 131072）。」。

事实上，超长日报走 md-format 的 LLM 重写是脆弱的：哪怕把 `maxTokens` 提到 131072，遇到分析立场的多章节日报依然可能撞上限。同时，`polishEditorialMarkdown`（deterministic 路径）已覆盖：

- 中文半角 → 全角标点
- 单行表 → 列表
- 连续近重复段落去重
- 标题改短 / 去元话语 / 去 AI 套话

对已结构合规的日报成稿，deterministic 打磨的可见差异远小于 LLM 重写。把 LLM 重写做成"锦上添花"，截断时无缝 fallback 到 deterministic 兜底，**比硬抛错让用户重跑整篇日报**更符合产品体验。

## 决策

- `assertNestedTextOutputComplete` 拆为 `checkNestedTextOutputComplete`（返回 warnings，不抛错）+ `assertNestedTextOutputComplete`（抛错，向后兼容）。
- `runNestedTextStep` 在 `textType === 'transform' && step.params?.deterministicPolish === true` 时，遇到 `finish_reason === 'length'`：
  1. 警告日志
  2. 退回入参 `nestedParams.input`（原成稿）
  3. 走下游 `polishEditorialMarkdown` 完成打磨，写回 `coreArtifact` / `finalArtifact`
- 其它路径（expert / plan / validation）保留抛错语义。
- 同步把日报 `text/transform/md-format` business 节点的 `generateParams.maxTokens` 从 8192 → 65536，减少截断概率（M3 推荐 131072，留给分片方案后续落地）。

## 后果

- 超长日报不再因 md-format 截断而 fail；用户看到的依然是「已生成完成 + 已自动去 emoji/统一全角」。
- deterministic 路径不变（机械规则），仅在 LLM 路径真撑不下时兜底。
- 日志里会有 `[nestedText] ... 已 deterministicPolish 兜底，不阻断任务` 警示，便于监控 fallback 频率。
- 真正的"用 LLM 改造长文档"问题留给下一轮按章节分片方案（todo id 2 已挂在另一个分支）。

## 范围

- `mxmcgi/src/tasks/business-pipeline-steps.ts` — 拆校验函数 + transform 路径降级
- `mxmcgi/src/tasks/examples/writing-generator-industry-daily.business.json` — md-format maxTokens=65536