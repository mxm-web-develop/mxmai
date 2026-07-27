# ADR: 用户资产存储（资产中心目录 + 临时文件）

## 状态

Accepted — 2026-06-04（在 [storage-domains.md](./storage-domains.md) 三块存储之上扩展）

## 背景

用户上传需要两类语义：

1. **资产（Asset）**：用户在「资产中心」可见、可建文件夹、可长期保留，默认进入 `user-assets` 桶。
2. **临时（Temp）**：任务参考图、表单一次性附件等，写入临时区，任务结束或 TTL 到期后删除。

当前实现已有 `storage_objects`、`upload/{userId}/...` 与 `upload/temp/{userId}/...` 路径、`purpose=temp` 时 7 天 `expires_at`，以及 Web「资产中心」虚拟文件夹（`folders` 表，现主要关联 `task_id`）。尚未打通：**上传时用户选择**、**文件夹路径写入 object_key**、**临时区独立桶/清理策略**。

## 决策

### 存储分类（对用户可见）

| 模式 | `storage_mode` | 物理位置 | 元数据 | 生命周期 |
|------|----------------|----------|--------|----------|
| 资产 | `asset` | `user_upload` 桶 `user-assets` | `storage_objects` + 可选 `folder_id` | 长期，用户删才删 |
| 临时 | `temp` | 临时桶或同桶 `upload/temp/...` | `storage_objects`，`expires_at` | TTL / 任务完成后清理 |

默认上传（业务未指定时）：**`asset`**，落入用户默认目录（可配置，见下）。

### 对象 Key 规范（扩展）

```
# 资产（永久）— 支持资产中心文件夹
upload/{userId}/assets/{folderPath}/{yyyy}/{uuid}.{ext}
# folderPath: 用户文件夹 slug 路径，如 "女装SKU/2026Q1"，根目录为 "_"

# 临时（用完即删）
upload/temp/{userId}/{yyyy}/{uuid}.{ext}
# 或独立桶时 key 可省略 userId 前缀，由配置决定
```

`folderPath` 由资产中心 `folders` 树解析（校验归属 `user_id`，禁止 `..`）。

### 与资产中心的关系

- **folders / folder_items**（已有）：表示用户逻辑目录。
- **扩展**：`folder_items` 增加可选 `storage_object_id`（与 `task_id` 互斥或并存），资产中心列表以 `storage_objects` 为主数据源，任务产出仍可用 `task_id`。
- 用户在资产中心「新建文件夹 / 移动」只改 DB 关联或 `folder_id` 字段，**不移动 R2 对象**（P0）；P1 可选物理 `copyObject` 迁移。

### 环境变量（建议）

```bash
# 永久用户资产（已有）
STORAGE_USER_UPLOAD_BUCKET=user-assets

# 临时文件：二选一
# A) 同桶不同前缀（默认，实现简单）
STORAGE_USER_TEMP_PREFIX=upload/temp

# B) 独立桶（与 generated 临时 gen/temp 分离）
STORAGE_USER_TEMP_PROVIDER=r2
STORAGE_USER_TEMP_BUCKET=user-temp
STORAGE_USER_TEMP_TTL_DAYS=7
```

任务级生成临时文件仍走 **`generated`** 域 `gen/temp/...`（`aigc` 桶），与用户上传临时分离。

### API（上传）

`POST /api/v1/cgi/upload/assets`（及 `r2-reference` alias）扩展 body / query：

```json
{
  "storageMode": "asset",
  "folderId": "uuid-optional",
  "purpose": "reference"
}
```

| 字段 | 说明 |
|------|------|
| `storageMode` | `asset`（默认）\| `temp` |
| `folderId` | 仅 `asset` 有效，落到对应 `folderPath` |
| `purpose` | `reference` \| `character` \| `knowledge` \| `custom` |

响应不变：`objectId`、`url`（`/api/v1/media/object/:id`）、`key`、`bucket`、`storageMode`。

`GET /api/v1/storage/objects?folderId=&storageMode=asset` — 资产中心列表。

### 清理策略

| 触发 | 行为 |
|------|------|
| `expires_at < now()` | 定时任务：`cleanup_expired_storage_objects` + 删 R2 对象 |
| 任务 `completed` / `failed` | 扫描 `metadata.tempForTaskId`，删除关联 `storage_mode=temp` 对象 |
| 用户删除 | `DELETE /storage/objects/:id`（已有） |

### 前端（资产中心 / 表单）

- 上传组件增加：**保存到资产** / **仅本次任务临时使用**。
- 资产模式：可选目标文件夹（树来自 `/folders`）。
- 临时模式：显示 TTL 提示（与现有 SchemaForm 警告一致）。
- 「最近上传」列表按 `storageMode` 分 tab：资产 | 临时。

## 与现网差异（实施前）

| 能力 | 现状 | 目标 |
|------|------|------|
| 默认上传路径 | `upload/{userId}/reference/...` | `upload/{userId}/assets/{folderPath}/...` |
| 用户选临时/资产 | 无，参考图固定 `reference` | `storageMode` 参数 |
| 资产中心文件夹 | 仅关联任务 | 关联 `storage_object_id` |
| 临时桶 | 与 `user-assets` 同桶 `upload/temp/` | 可配置独立 `user-temp` |
| 任务结束删临时 | 未实现 | `tempForTaskId` 清理 |

## 实施顺序（建议）

1. **P0**：`storage_mode` + `folder_id` 字段迁移；`PathTemplateRegistry` 资产路径；上传 API 参数；默认 `asset`。
2. **P1**：资产中心 UI 选文件夹；`folder_items.storage_object_id`；列表 API。
3. **P2**：独立临时桶 env；任务完成钩子删临时对象；cron 硬删过期对象。

## 参考实现位置

- 上传：`mxmcgi/src/storage/user-upload-service.ts`、`mxmcgi/src/routes/upload.ts`
- 路径：`mxmdata/src/storage/PathTemplateRegistry.ts`
- 元数据：`storage_objects`、`mxmcgi/src/storage/storage-routes.ts`
- 资产中心 UI：`web/src/pages/VirtualFolder.tsx`
- 文件夹：`mxmdata` `folders` / `SupabaseFolderRepository`
