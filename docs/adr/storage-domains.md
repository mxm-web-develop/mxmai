# ADR: 平台三块对象存储域

## 状态

Accepted — 2026-06-03

## 背景

平台对象存储原先为 MinIO 单轨 + R2 旁路，无法按模块独立切换 backend，用户上传无统一元数据管理。

## 决策

### 三个存储域

| 域 ID | 职责 | 默认 access |
|-------|------|-------------|
| `generated` | AI 任务产出 + 任务内临时文件 | `proxy` |
| `user_upload` | 用户上传（参考图、知识库原文件、temp） | `proxy` |
| `system_static` | Admin 预置系统素材 | `public` |

### 三个 backend（每域独立配置）

- `minio` — 本地 / 自建
- `r2` — Cloudflare R2
- `aliyun_oss` — 阿里云 OSS（S3 兼容）

统一实现：`mxmdata/src/storage/adapters/S3StorageAdapter.ts` + `StorageService`。

### Key 规范

```
user_upload:  upload/{userId}/{purpose}/{yyyy}/{uuid}.{ext}
              upload/temp/{userId}/{yyyy}/{uuid}.{ext}
generated:    gen/{scope}/{userId}/{taskId}/{index}.{ext}
              gen/temp/{scope}/{taskId}/{name}.{ext}
system_static: sys/{category}/{version}/{filename}
```

### 元数据

表 `storage_objects`（见 `mxmdata/src/database/migrations/add_storage_objects.sql`）。

### URL

- 用户上传：`GET /api/v1/media/object/{objectId}`
- 生成内容：`GET /api/v1/media/{scope}/{taskId}`（不变）
- 系统静态：`GET /api/v1/static/{path}` 或 CDN 公网 URL

### 兼容

- 旧 key（`{userId}/upload/graph/`、R2 flat key 等）经 `/media/asset?bucket&key` 双读
- `/upload/r2-reference` 为 alias，写入 `storage_objects`

## 配置

见根目录 `.env.example` 中 `STORAGE_*` 变量块。

## 用户资产 vs 临时文件

业务上区分「资产中心永久资产」与「任务临时附件」，路径、TTL、文件夹见 **[user-asset-storage.md](./user-asset-storage.md)**。

## 迁移

```bash
# 1. 执行 SQL
pnpm --filter @mxmai/mxmdata run migrate:storage-objects

# 2. 可选：R2 参考图元数据迁移
pnpm --filter @mxmai/mxmcgi exec tsx src/scripts/migrate-user-reference-to-storage-objects.ts
```
