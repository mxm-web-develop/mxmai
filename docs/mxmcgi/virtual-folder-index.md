# 知识库（原「虚拟文件夹」）向量化与召回

知识库以文件夹树组织知识 / 角色 / 风格 / 文件。`folder_kind=virtual` 的文件夹可向量化索引，自动绑定底层向量库（`display_name` 历史可能仍为 `虚拟文件夹: <路径>`，`name` 为 `vf_<folderId>`），供业务召回。Smartflow 旧独立 KB 入口不再维护。

## 触发索引

```http
POST /api/v1/virtual-folder-index/{folderId}
Authorization: Bearer {token}
Content-Type: application/json

{ "force": false }
```

响应 `202` 表示异步索引已开始。索引范围：当前文件夹层内所有软链（`task_id` + `storage_object_id`），不含子文件夹递归。

## 查询状态

```http
GET /api/v1/virtual-folder-index/{folderId}/status
```

返回 `index_status`（`none` | `indexing` | `indexed` | `stale`）、`knowledge_base_id`、各软链 `folder_index_entries`。

## 文件夹内召回

```http
POST /api/v1/virtual-folder-index/{folderId}/search
Content-Type: application/json

{ "query": "女装 春季 配色", "limit": 5 }
```

## Smartflow vector_recall

工作流 **tools** 节点使用 `vector_recall`：

1. 先对知识库文件夹执行向量化（Web 或上述 API）
2. 从 `GET /api/v1/assets/folders/{id}/items` 或 status 接口读取 `knowledge_base_id`
3. 在 `vector_recall` 节点配置：

```json
{
  "tool_type": "vector_recall",
  "params": {
    "knowledgeBaseId": "<folder.knowledge_base_id>",
    "query": "{{input.query}}",
    "search_type": "hybrid",
    "limit": 5
  }
}
```

## 索引内容（第一期）

| 软链类型 | 处理方式 |
|----------|----------|
| 写作/文本任务 | metadata + result 文本 |
| 图片任务/上传图片 | Gemini vision caption + OCR → 文本 embedding |
| txt/md 上传 | 直读分块 |
| pdf/video/audio | skipped（记录原因） |

> **风格卡（`card_tag=style`，UI「视觉风格」）**：逐张 `StyleVisionObj` + 整包 `StylePackSummary`，经入库 text 业务；**不建 KB、不 embedding**。见 [`virtual-folder-style-pack.md`](./virtual-folder-style-pack.md)。  
> **语感文风卡（`card_tag=writing`）**：逐篇 `WritingStyleObj` + 整包 `WritingStylePackSummary`；**不建 KB**。见 [`virtual-folder-writing-style-pack.md`](./virtual-folder-writing-style-pack.md)。  
> **角色卡（`card_tag=character`）**：整夹一次 `CharacterPackSummary`（可推理补全；参考图 1～10；模卡/宫格标 multi-panel）；**不建 KB**。见 [`virtual-folder-character-pack.md`](./virtual-folder-character-pack.md)。**PDF 解析仍为空缺**。

## 数据库迁移

执行 [`mxmdata/src/database/migrations/add_virtual_folder_fields.sql`](../../mxmdata/src/database/migrations/add_virtual_folder_fields.sql)。
