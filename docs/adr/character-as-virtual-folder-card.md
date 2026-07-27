# ADR: 角色（Role）统一为虚拟文件夹 Character 卡片

## 状态

Accepted — 2026-07-16

## 背景

早期 SuperMXMai 有独立 **Character 模块**：`characters` 表、`/api/v1/characters` HTTP API、`CharacterService`、`ICharacterRepository`、Web「角色管理」页与 Mobile 角色库。写作/大纲通过 `cast_character_ids`、`characterIds` 从角色库解析角色画像。

VF Card System 将「角色 / 人设 / 出演人员」收敛为 **虚拟文件夹（Virtual Folder）内 `card_tag=character` 的卡片**，与资产、知识库等同属 VF 索引体系。

## 决策

1. **删除独立 Character 模块**（代码层，非 DB migration）  
   - 移除 `mxmcgi/src/characters/`、`mxmcgi/src/routes/character.ts`  
   - 移除 Gateway `/api/v1/characters` 代理与 OpenAPI 条目  
   - 移除 `mxmdata` 的 `ICharacterRepository` / `SupabaseCharacterRepository` / `RepositoryFactory.createCharacterRepository`  
   - 移除 Web `Characters` 页与 client 中的 character REST 封装  
   - Mobile 移除角色库管理屏与 `/api/v1/characters` 调用

2. **角色在写作链路中的新语义**  
   - 大纲/写作任务 **`result.metadata.characters`** 仍保留 **内联 `CharacterProfile` 对象数组**（LLM 生成或用户编辑），不依赖 Character 模块回查。  
   - 不再支持 `cast_character_ids`、`characterIds` 从旧角色库加载。  
   - 用户侧「角色库」入口改为 **虚拟文件夹 → character 卡片**（VF API / 索引，非本文档范围）。

3. **数据库**  
   - 不在此 ADR 中 drop `characters` 表；表结构变更由既有 migration（如 `add_folder_card_fields.sql`）与后续 VF 迁移负责。

## 后果

- 依赖 `/api/v1/characters` 的客户端、脚本、文档需迁移到 VF 卡片 API。  
- `cast_character_count` 仍可作为大纲表单 hint，但不再通过已删除的 `CharacterService.generateCharacters` 自动落库。  
- 任务详情 API 不再将 `metadata.character_ids` 解析为完整 profile；客户端应使用任务内联 `metadata.characters`。

## 参考

- VF Card System 计划（仓库内 plan，不随本 ADR 修改）  
- `docs/mxmcgi/virtual-folder-index.md` — 虚拟文件夹与卡片索引
