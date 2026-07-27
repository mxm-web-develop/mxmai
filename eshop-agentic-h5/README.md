# Eshop Agentic H5

面向电商运营、摄影师、模特的移动端 PWA，通过平台 **Open API** 消费与 Web 端一致的 eshop 商拍、Smartflow 批量、图生视频、宫格 HD 放大能力。

> **第三方独立部署**：运行时数据**仅**经 Gateway HTTP（Open API、媒体代理等），禁止在应用代码中读取 monorepo 其它包或执行 `scripts/sync-platform-manifests` 取业务数据。详见 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)。

## 产品能力（H5 围绕 Open API 宫格商拍）

| 能力 | 说明 |
|------|------|
| 创作入口 | 「创作」页选业务；摄影进 `/start/shoot/:line` 表单，海报/视频/Smartflow 进 `/create/:slug` |
| 摄影线 | 女装 / 男装 / 童装 / 饰品 / 鞋帽 → 3×3 宫格表单 |
| 固定 3×3 宫格 | `output_grid=3x3`，平台裁格后 9 张单格 |
| 1～3 份并发 | `parallel_count` 1～3，每份一套九宫格 |
| 历史查询 | 「历史」列表 + 详情进度（WS 优先） |
| 单格 HD | 结果页点选格位 → `tools-hd`（`is_grid` + `grid_cell`） |
| 传图 | 相册 / 拍摄 / 历史资源，自动压缩 |

## 已对接 Open API slug

| slug | 平台能力 |
|------|----------|
| `eshop-womenoutfits` | graph/eshop/clothes-women |
| `eshop-manoutfits` | graph/eshop/clothes-men |
| `eshop-childoutfits` | graph/eshop/clothes-kids |
| `eshop-accessoriesoutfits` | graph/eshop/accessories（需在 Admin 发布） |
| `eshop-shoeshats` | graph/eshop/shoes-hats |
| `eshop-poster-quick` | 设计 · 宣传海报（示例 manifest） |
| `eshop-vedio` | video · 上架图动效短片 |
| `smartflow-eshop-graph-video` | Smartflow 商拍 → 动效全套 |
| `tools-hd` | graph/tools/hd（结果页按格触发） |

### API Token 创建失败

若 Web 提示 `user_api_keys` 表不存在：

```bash
pnpm --filter @mxmai/mxmdata run migrate:user-api-keys
pnpm --filter @mxmai/mxmdata run reload-schema   # 如 PostgREST 仍报 schema cache
```

然后在 **Web → 我的账号 → API Token** 创建 `mxm_…` 密钥，填入 H5 **我的** 页。

平台 formSchema 变更后，**仅在开发机**同步 fixtures（勿接入 Next 运行时）：

```bash
cd eshop-agentic-h5 && pnpm run sync:manifests
```

生产/独立部署以 `GET /api/v1/open/:slug` 为准；fixtures 仅为离线兜底。

## 快速开始

```bash
pnpm install
pnpm dev:eshop-h5   # monorepo 根目录
```

浏览器 http://localhost:3100

## 任务文件夹（仅 H5 本地归属，服务端不变）

mxmcgi / MinIO 仍按平台原有规则存盘；H5 **不修改** Open API 或服务端 `pathTemplate`。

H5 在浏览器内按**一次提交 = 一个任务文件夹**归档（IndexedDB + Blob）：

```
tasks/{jobId}/
  0001.jpg … 000N.mp4   # 同一次商拍多图、批量 SKU、Smartflow 多节点输出
```

- Task V2 多图 / `parallel_count` / 批量父任务子任务 → 全部写入**同一** `jobId` 目录
- Smartflow `output_data`（如 `still_image` + `showcase_video`）→ 同一目录
- 列表与详情优先读取本地目录中的 blob URL

## 移动端弹层规范（必遵）

- **禁止** `window.confirm` / `window.alert` / `window.prompt`（桌面浏览器原生框不符合 H5 体验）
- 二次确认、错误提示：根布局已挂载 `MobileDialogProvider`，在 Client 组件内使用 `useMobileDialog()` 的 `confirm()` / `alert()`
- 表单与选项：使用 `BottomSheet`、`IosPickerField`
- 完整说明见 [`design-system/MOBILE-OVERLAYS.md`](design-system/MOBILE-OVERLAYS.md)

## 架构

```
src/catalog/       # 服务目录 + manifest 索引
src/fixtures/manifests/  # sync 脚本生成的 formSchema
src/lib/task-folder/ # 任务目录 IndexedDB 存储
src/adapters/      # mock | http Open API
src/components/schema/  # 移动端动态表单
```

### Mock（默认）

`NEXT_PUBLIC_API_MODE=mock`

### 接入真实 Open API

1. H5 **我的** →「平台 Open API」→ Gateway `http://localhost:3000` → 粘贴 `mxm_…` Key
2. 或 `.env`：`NEXT_PUBLIC_API_MODE=http`、`MXMTOKEN=mxm_…`；`NEXT_PUBLIC_OPEN_API_BASE` **留空**（经 Next 把 `/api` 代理到 Gateway，避免 3100→3000 跨域）

## 与 SuperMXMai 的关系

独立第三方客户端，不依赖 `web/` 登录；本目录可放在 monorepo 内联调，但**部署产物不包含** `mxmcgi` / `mxmdata`。缺接口时在平台侧扩展 Open API，见 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)。
