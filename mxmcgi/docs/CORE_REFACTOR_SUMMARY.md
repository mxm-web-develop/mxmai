# core 拆分与清理说明

按「模型/provider → models、提示词工程 → prompts、知识库 → knowledge、任务 → task、路由 → routes、清理废弃」的规划，已完成以下改动。

---

## 已完成的迁移

### 1. 任务 → `src/task`

- **迁移**：将 `core/task` 整目录迁到 `src/task`（含 task-manager、task-executor、database-storage、task-recovery、notification-hook、notification-outbox、payment-client、types 等）。
- **引用更新**：`task/*.ts` 内对 core 的引用改为 `../core/providers`、`../core/utils`、`../core/graph`、`../core/writing`、`../core/video`、`../core/audio`、`../core/text`；所有原引用 `core/task` 的模块改为引用 `task`（routes、knowledge、core/writing、core/graph、core/character、core/video、index、test）。
- **删除**：`core/task` 已删除。

### 2. 知识库 → `src/knowledge`

- **迁移**：将 `core/knowledge` 整目录迁移到 `src/knowledge`（含 knowledge-service、embedding、file-parser、knowledge-task、文档等）。
- **引用更新**：`routes/knowledge.ts`、`core/graph/graph-service.ts`、`core/writing/knowledge-enhancer.ts`、`scripts/init-system-kb.ts`、`scripts/test-kb-recall.ts` 已改为从 `../knowledge` 或 `../../knowledge` 引用。
- **knowledge 内部**：`knowledge-task.ts` 引用 `../core/task/task-executor`；`embedding/providers/deer.provider.ts` 引用 `../../../core/utils/deerapi-client`。
- **保留**：`core/writing/knowledge-enhancer.ts` 仍放在 core，作为写作侧对知识库的集成，仅引用 `src/knowledge`。

### 3. 提示词工程 → `src/prompts`

- **新增**：`src/prompts/resolver.ts`、`src/prompts/index.ts`，实现「按业务 key 从 DB 或代码解析 rules / outputFormat」的逻辑（原 `core/prompt-config-resolver.ts`）。
- **引用**：`prompts/resolver` 仍从 `../core/writing/wtconfigs`、`../core/graph/graphconfigs` 取回退配置；`core/writing/writing-service.ts`、`core/graph/graph-service.ts` 改为从 `../../prompts` 引用解析结果。
- **删除**：`core/prompt-config-resolver.ts`。
- **未迁**：`core/writing/wtconfigs`、`core/graph/graphconfigs` 仍留在 core（与 writing/type、shared/formOptions 等强耦合），后续若需可再迁入 `src/prompts` 并统一引用。

### 4. 路由

- 路由始终在 `src/routes`，未从 core 迁出。

---

## 已完成的清理

### 1. writing-rewrite / writing-polish 与规范对齐

- **规范**：BUSINESS_INTERFACE_SPEC 中 writing-rewrite、writing-polish 已废弃，不再作为业务 key。
- **改动**：`routes/writing.ts` 中改写、润色任务创建与执行时，`model` / `modelName` 改为使用 `getWritingBusinessKey(writingType)`（如 `writing-articles`），不再使用 `writing-rewrite`、`writing-polish`。

### 2. 敏感词文件命名

- **重命名**：`core/writing/sensitives_words.ts` → `core/writing/sensitive-words.ts`，并统一使用 `sensitivesWords` 导出名。
- **引用**：`routes/writing.ts` 已改为从 `../core/writing/sensitive-words` 引用。

### 3. 过时注释与文档

- **core/providers/deer.provider.ts**：注释由「core/utils/suport-list.ts」改为「models/suport-list.ts」。
- **core/providers/OFFICIAL_PROVIDER.md**：所有「core/utils/suport-list」改为「src/models/suport-list」。

---

## 未做 / 建议后续做的部分

### 1. 模型与 provider（`core/providers`、core 内模型适配层）

- **现状**：`core/providers`（工厂、各 provider、model-routing、provider-keys、provider-stats、types）及 core 内 audio/video/graph 的模型适配层仍保留在 core。
- **原因**：迁到 `src/models` 会牵动大量引用（routes、models/*、core/task、core/writing 等），本次未动。
- **建议**：若希望「模型与 provider 全收口到 models」，可单独排期：将 `core/providers` 迁为 `src/models/providers`，并全局替换引用；core 内仅保留业务编排，模型调用统一经 models 层。

### 2. 提示词配置本体（wtconfigs、graphconfigs）

- **现状**：写作/图文的 rules、outputformat、formOptions 仍在 `core/writing/wtconfigs`、`core/graph/graphconfigs`，仅「解析入口」在 `src/prompts`。
- **建议**：若希望提示词工程完全独立，可将 wtconfigs、graphconfigs 迁入 `src/prompts`（如 `prompts/writing`、`prompts/graph`），并解决对 `core/writing/type`、`core/shared/formOptions` 的依赖（抽类型到 shared 或 prompts 内）。

### 3. text 业务

- **规范**：BUSINESS_INTERFACE_SPEC 中 text 已废弃，能力归入 writing。
- **现状**：`routes/text`、`core/text` 仍存在；`core/writing/writing-service` 仍从 `routes/text` 的 MODEL_MAP 回退。
- **建议**：若确定下线 text 接口，可移除 `routes/text` 注册及 `core/text`，并将 writing 回退逻辑改为仅用 models/registry 或统一入口。

---

## 当前 core 目录职责（迁移后）

- **core/audio、core/video、core/graph（含 nano-banana、seedream 等）**：业务编排 + 模型适配层（委托 models 或 provider）。
- **core/writing**：写作业务编排、model-selector、business-key、knowledge-enhancer、wtconfigs、document-formatter、type 等。
- **core/character**：角色业务。
- **core/providers**：Provider 工厂、各 provider 实现、model-routing、keys、stats、types。
- **core/task**：任务管理、执行、存储、恢复、通知、支付等。
- **core/utils**：通用工具（deerapi-client、image-processor、sensitive-check 等）。
- **core/shared**：表单/字段等共享类型。

知识库已迁至 `src/knowledge`；任务已迁至 `src/task`；提示词「解析」已迁至 `src/prompts`，配置本体仍在 core。剩余未迁移内容见 `docs/CORE_REMAINING_ANALYSIS.md`。
