# mxm-wrap / 平台架构草稿

## 先决：模块改名「虚拟文件夹」→「知识库」（前端已完成）

### 产品定义

| 说法 | 定位 |
|------|------|
| **知识库** | 正式功能名：集 **知识、角色、风格、文件** 管理于一身 |
| **文件夹** | 知识库内的组织单位（树、软链、`@`），工作方式而非模块名 |

### 旧独立知识库（已定）

- 用户侧 **不再提供** 旧 `/api/v1/knowledge/bases` 产品入口（Agent `@` 旧 Tab 已移除；前端 client 死 API 已删）
- **不维护** Smartflow 对旧 KB 的依赖（业务改版后 Smartflow 大改，本次忽略）
- **保留** 夹向量化时绑定的底层 `knowledge_base_id`（实现细节，不对用户叫「另一套知识库」）
- 后端旧 CRUD / `virtual-folder-index` 路径可后续再迁；前端符号已统一为 `KnowledgeBase` / `KnowledgeFolder*`

### 代码约定（避免残留）

| 层 | 命名 |
|----|------|
| 页面 / PageId / nav | `knowledgeBase` |
| 组件目录 | `web/src/components/knowledge-base/` |
| 文件夹操作 API 封装 | `getKnowledgeFolders` 等（HTTP 仍 `/virtual-folder-index`） |
| 后端字段（暂不改） | `virtual_folder_id`、`folder_kind: 'virtual'` |

### 与 mxm-warp

- `@知识库`（夹/文件）→ `contract.sources`
- enrich：模型主动网络检索；不再表单手填召回/搜索词
