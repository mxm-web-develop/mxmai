# Eshop Agentic H5 — Design System

> 电商广告创作移动端 PWA · Phase 1 Mock 原型

## 品牌气质

专业摄影棚 + 电商运营效率感。避免泛 AI 紫渐变，强调成片预览与素材上传。

## 色板

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-bg` | `#0A0A0B` | 页面背景 |
| `--color-surface` | `#18181B` | 卡片、底部栏 |
| `--color-surface-elevated` | `#27272A` | 浮层、输入框 |
| `--color-border` | `#3F3F46` | 分割线 |
| `--color-text` | `#FAFAFA` | 主文字 |
| `--color-text-muted` | `#A1A1AA` | 次要文字 |
| `--color-accent` | `#F59E0B` | 暖金强调（CTA、选中态） |
| `--color-accent-coral` | `#FB7185` | 珊瑚辅助（徽章、进度） |
| `--color-success` | `#34D399` | 完成状态 |

## 字体

- 中文：`Noto Sans SC`（Google Fonts）
- 英文/数字：`DM Sans`
- 展示标题可选用 `Syne`（少量使用）

## 间距与触控

- 最小触控区：**44×44px**
- 页面水平内边距：**16px**（`px-4`）
- 卡片圆角：**12px**（`rounded-xl`）
- 底部 Tab 高度：**56px** + safe-area

## 组件规范

### ServiceCard
深底卡片 + 左侧品类色条 + 标题/描述 + 右箭头。`cursor-pointer`，按压 `scale(0.98)`。

### BottomSheet
参数选择（shoot_preset、output_grid）从底部滑入，`max-height: 70vh`。

### 弹层 / 对话框（必读）

**禁止** `window.confirm` / `window.alert` / `window.prompt`。统一使用 `MobileDialogProvider`（`useMobileDialog`）与 `BottomSheet`，规范见 **[MOBILE-OVERLAYS.md](./MOBILE-OVERLAYS.md)**（iOS Action Sheet / Alert 样式）。

### ReferenceImageSlot
正方形槽位，虚线边框空态；已选图 `object-fit: cover`；相机/相册双入口。

### JobProgress
环形进度 + 批量子任务列表（Smartflow mock）。

## 反模式

- **禁止浏览器原生弹窗**（`confirm` / `alert` / `prompt`）→ 见 MOBILE-OVERLAYS.md
- 不用 emoji 作图标（用 Lucide SVG）
- 长表单避免单页滚动 → 分步向导
- 尊重 `prefers-reduced-motion`

## 角色快捷入口

| 角色 | 主色点缀 | 默认筛选 |
|------|----------|----------|
| 运营 | 暖金 | 批量、多 SKU |
| 摄影师 | 珊瑚 | 参考图、光影预设 |
| 模特 | 浅金 | 极简上传 |
