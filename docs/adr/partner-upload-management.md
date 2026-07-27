# ADR: Partner 上传分区管理

**状态**: 已采纳  
**日期**: 2026-06-15

## 背景

integration Key 所属用户（发布者）与 Partner 应用终端用户均可产生 `storage_objects` 上传。Partner Session 上传时 metadata 已写入 `partner_app_id` / `end_user_id`，但 Web 上传管理器按 `user_id` 混列 asset/temp，发布者无法区分「自己」与「应用用户」的上传。

## 产品决策

| 决策 | 结论 |
|------|------|
| 发布者收进资产中心 | **不能** — Partner 上传强制 `storage_mode=temp`，禁止 folder/move |
| H5 终端用户历史 | **要做** — Partner Session 专用列表/删除 API + H5「我的上传」 |
| 清理策略 | **与个人 temp 一致** — `expires_at` cron + `tempForTaskId` 任务完成钩子 |

## 决策

### 1. 来源维度（列 + 过滤）

在 `storage_objects` 增加可索引列：

- `partner_app_id` — 非空表示 Partner 来源
- `partner_end_user_id` — 终端用户

**uploadSource 语义**：

| 值 | 条件 |
|----|------|
| `self`（默认） | `partner_app_id IS NULL` |
| `partner` | `partner_app_id IS NOT NULL` |
| `all` | 不过滤 |

计费 owner 仍为 `user_id`（发布者/integration Key 所属用户）。

### 2. Partner 上传写入规则

存在 Gateway 注入的 Partner 上下文时：

- 强制 `storage_mode = temp`
- `folder_id = null`
- 写入 `partner_app_id` / `partner_end_user_id`（与 metadata 双写）
- TTL 与个人 temp 相同（`userTempTtlDays()`）

### 3. API

**发布者（JWT / personal Key）**

```
GET /api/v1/storage/objects?uploadSource=self|partner|all&partnerAppId=&partnerEndUserId=
```

**终端用户（Partner Session）**

```
GET    /api/v1/partner/me/uploads
DELETE /api/v1/partner/me/uploads/:objectId
```

路由由 mxmcgi 实现；Gateway 在 `/api/v1/partner` → mxmauth 之前单独代理 `me/uploads` → mxmcgi。

### 4. 不采用 partner_assets 双写

`partner_assets` 表保留供未来 `app_shared` 静态素材；日常终端用户上传仅以 `storage_objects` 为数据源。

## 相关 ADR

- [user-asset-storage.md](./user-asset-storage.md) — asset/temp 与文件夹
- [partner-end-user-phase1.md](./partner-end-user-phase1.md) — Partner Session 与任务 ACL
- [partner-access-control.md](./partner-access-control.md) — slug / 白名单

## 迁移

```bash
pnpm --filter @mxmai/mxmdata run migrate:storage-objects-partner-source
pnpm --filter @mxmai/mxmdata run backfill:storage-objects-partner-source  # 可选，存量 metadata 回填
```

修改 mxmdata 后须 `pnpm build:mxmdata` 再构建 mxmcgi / gateway。
