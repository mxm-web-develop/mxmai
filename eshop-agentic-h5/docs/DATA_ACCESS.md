# 数据访问规范（第三方独立部署）

`eshop-agentic-h5` 是**可独立部署**的第三方客户端。本仓库虽放在 SuperMXMai monorepo 内便于联调，但**运行时不得依赖** monorepo 内其它包（`mxmcgi`、`mxmdata`、`web` 等）的文件、数据库或内部脚本。

## 允许

| 场景 | 方式 |
|------|------|
| 业务配置 / 表单契约 | `GET /api/v1/open/{slug}`（优先）；离线兜底见 `src/fixtures/manifests/` |
| 提交任务 | `POST /api/v1/open/{slug}/run` |
| 查询进度与结果 | `GET /api/v1/open/{slug}/jobs/{jobId}`（含 `metadata.gridCells`、`result.mediaUrls`、子任务 `parallel`） |
| **任务列表（云端权威）** | `GET /api/v1/open/jobs?rootOnly=true&limit=&cursor=`（Partner session，按 `endUserId` ACL） |
| 按任务取媒体二进制 | `GET /api/v1/media/graph/:taskId` 等（Gateway 文档见根仓库 `docs/API.md`） |
| 实时通知 | WebSocket `task_notifications`（经 Gateway 代理） |
| 本地归档 | 浏览器 IndexedDB：资产仍按 `platformJobId` 缓存在 `assets`；**用户可见「项目」** 见下文 H5 项目层 |

所有 HTTP 经 H5 同源 `/api/*` 代理或配置的 Gateway 基址，携带 `Authorization: Bearer mxm_…`。

## H5 项目层（云端优先 + IndexedDB 缓存）

平台 Open API **没有「项目」概念**，只有 `POST .../run` 返回的 `jobId`。H5 在本地引入 **Project** 作为用户可见实体；**列表权威数据源为云端** `GET /api/v1/open/jobs`，IndexedDB 仅作缓存与 UX 增强。

### 数据流

```text
OpenApiBootstrap / login / refresh
        ↓
syncProjectsFromCloud()  ← GET /open/jobs?rootOnly=true
        ↓
IndexedDB (projects / platform_jobs)  ← stale-while-revalidate
        ↓
useProjectList / 详情页 getJob
```

| 存储 | 主键 | 说明 |
|------|------|------|
| `projects` | `projectId`（本地 UUID） | 列表/详情路由 `/projects/{projectId}`；含 `endUserId` 隔离 |
| `platform_jobs` | `slug::platformJobId` | 每次 `run` 一条记录，含 `role`（`shoot` / `hd` / `video` / …） |
| `assets` | `platformJobId/assetId` | 成片 blob 缓存（v1 未改） |

- **同步**：`project-sync.ts` 分页拉云端根任务 → upsert 本地 project/platform_job；云端不存在的本地根项目会被**删除**（含关联 blob）
- **身份**：`partner-session` 持久化 `endUserId`；`listProjects` 仅展示当前 `endUserId` 记录
- **节流**：非 `force` 时 5 分钟内不重复全量 sync
- **Mock 模式**：不调用 `/open/jobs`，行为与纯本地一致

- **商拍**：`createProjectFromShootRun` → 1 项目 + 1 条 `role=shoot` 的 PlatformJob（parallel 父任务即 `rootPlatformJobId`）
- **HD / 未来视频**：`attachPlatformJob(projectId, …)`，通过 `context.gridCell`、`sourcePlatformJobId` 关联格位，**不再**使用 v1 的 `derivedFrom` / `hiddenInHistory`
- **历史列表**：HTTP 模式下 `listProjects()` 先 sync 再读 IDB；不展示 HD 子任务（`tools-hd`）为独立条目
- **旧书签** `/jobs/{platformJobId}`：启动迁移后查 `platform_jobs` 得到 `projectId` 并 redirect
- **v1 迁移**：`OpenApiBootstrap` 调用 `ensureProjectStorageReady()`，将旧 `jobs` store 一次性迁入 projects

Mock 模式与 HTTP 适配器均走同一套 `project-store` API；HTTP 适配器额外在 `listJobs` / `listProjects` / `refresh` 时触发 sync。

## 禁止

- 在 `app/`、`src/` 中 `import` 或 `require` monorepo 兄弟目录（如 `../../mxmcgi`）
- 在页面/组件/Hook 中执行 `node scripts/*`、读写 `mxmcgi` bundle、直连 MinIO（非 Gateway 代理地址）
- 在**无 Open API 响应字段**时，用任务 ID **猜测**成片地址并当作「已完成结果」展示（例如仅拼 `/api/v1/media/graph/:id` 而不先解析 job 响应）
- 将 `pnpm run sync:manifests` 等开发脚本接入 Next 构建或运行时

## 开发期脚本（非运行时）

| 脚本 | 用途 |
|------|------|
| `scripts/sync-platform-manifests.mjs` | 从 monorepo `mxmcgi` 提取 formSchema 写入 `src/fixtures/manifests/`，**仅本地开发/发布前同步** |
| `scripts/generate-brand-assets.mjs` | 生成静态品牌图，与业务数据无关 |

独立部署时只需提交 `eshop-agentic-h5` 目录；manifest 以 fixtures 或线上 `GET /api/v1/open/:slug` 为准。

## HD 放大（`tools-hd`）

商拍结果页点格后，H5 经 `buildToolsHdParams` 组装 Open API `params`（与 `graph/tools/hd` formSchema 一致）：

| 场景 | `is_grid` | 必填 |
|------|-----------|------|
| 平台已返回裁格单图 | `false` | `source_images[0].content` |
| 整张联系表选格 | `true` | `source_images` + `grid_layout` + `grid_cell`；建议带 `source_graph_task_id` |

可选：`aspect_ratio`（空=保持原图比例）。交互见 `HdUpscaleSheet`（确认模式与画幅后再 `POST .../run`）。

## 平台需补齐的字段

若 H5 详情页任务已为 `completed` 但无法展示宫格/成片，请检查 Open API job 响应是否包含：

- Task V2：`metadata.gridCells[]`（`url`、`row`、`col`）或 `result.mediaUrls`
- 批量子任务：父任务 `parallel.childTaskIds`，且子任务响应含上述字段

缺字段时应在 **SuperMXMai 扩展 Open API 或文档化媒体接口**，而不是在 H5 内读 monorepo 源码。

## 代码审查清单

- [ ] 新增数据是否来自 `getOpenApiAdapter()` / `fetch('/api/…')`？
- [ ] 图片 URL 是否来自 job 响应或平台返回的绝对/相对 API 路径？
- [ ] 是否误用 `graphTaskMediaPath` 作为「无 results 时的默认展示」？
- [ ] 是否新增了对 `../mxmcgi` 的路径引用？
