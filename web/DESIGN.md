---
name: SuperMXMai Web
description: Mind × Machine — 多模态 AI 创作控制台设计系统
colors:
  brand-machine: "#002FA7"
  brand-mind: "#38BDF8"
  action-primary: "#0284C7"
  brand-conversation: "#E55A1C"
  neutral-bg-light: "#F3F4F6"
  neutral-bg-dark: "#0F172A"
  text-main-light: "#020617"
  text-muted-light: "#4B5563"
typography:
  ui:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    background: "linear-gradient(135deg, #0EA5E9, #0284C7, #002FA7)"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  page-card:
    backgroundColor: "var(--card-bg)"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
---

## Overview

SuperMXMai Web 是 **Mind × Machine** 品牌的多模态 AI 创作控制台：人类创意（Mind）由 sky 高光与预览区表达，机器执行（Machine）由 Klein Blue 品牌色与结构化布局表达。设计策略为 **Restrained Product UI**：克制玻璃卡片、固定 rem 字号阶梯、150–250ms CSS 状态切换，Dashboard 标题与沉浸式 Viewer 使用 GSAP。

## Colors

### 品牌 vs 行动色

| 角色 | Token | 用途 |
|------|-------|------|
| **Machine 品牌** | `#002FA7` `--brand-machine` | Logo、Landing、渐变终点、侧边栏品牌块 |
| **Mind accent** | `#38BDF8` / `#0EA5E9` | 页面光晕、生成中、Dashboard kicker |
| **Primary CTA** | `#0284C7` `--action-primary-solid` | 主按钮、Ant `colorPrimary`、链接选中态 |
| **CTA 渐变** | `--action-primary-gradient` | sky → machine 三段渐变，全站 `.btn-primary` / `ant-btn-primary` |

Primary 不再单独使用纯 Klein 重蓝实心按钮；CTA 以 Dashboard 验证的 **sky-600 渐变** 为主，Machine 蓝保留在渐变末端与品牌标识。

### Dashboard Capability Pills（pastel + 深字）

控制台首页 `Mind × Machine` 下的业务气泡配色已沉淀为 token（`--pill-*-bg/fg`），与任务 Tag / 状态 badge 同系：**浅底 + 高对比字**，而非高饱和实心块。

| 能力 | 背景 | 字色 |
|------|------|------|
| Writing | `#BAE6FD` 72% | `#0C4A6E` |
| Image | `#E0F2FE` 78% | `#075985` |
| Audio | `#CFFAFE` 75% | `#0E7490` |
| Music | `#EDE9FE` 78% | `#5B21B6` |
| Video | `#E0E7FF` 76% | `#3730A3` |
| Agent | `#DBEAFE` 78% | `#0369A1` |

### 语义色（Error / Warning / Success）

与 capability pill 一致：**pastel 背景 + 深色字**（亮色模式），暗色模式反转为深底浅字。

- `--semantic-error-*`：删除、危险按钮、失败 badge
- `--semantic-warning-*`：待审核、警告 Tag
- `--semantic-success-*`：已完成、成功 Tag

任务状态映射：`--status-*` → `--semantic-*`（亮色模式）。

### 其他

- **Conversation** `#E55A1C`：仅 Agent Chat
- **Surface**：`--glass-surface` 用于 page-card、任务卡片；禁止全站滥用 blur

## Motion

- **Dashboard 标题**：`Mind × Machine` 双层 GSAP 光带扫过（`.dv-title__beam`），`prefers-reduced-motion` 关闭
- **背景**：orb / grid / particle 既有 GSAP 保留
- **交互**：按钮 hover 150–200ms；卡片 translateY -1px

## Typography

- **UI 全局**：DM Sans，`--text-body` 14px
- **Display**：Space Grotesk，页面标题、Landing、Dashboard hero
- **阶梯**：caption 11px → meta 12px → label 13px → body 14px → title-sm 16px → title 20px → display 24px

## Elevation

- 阴影：`--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-xl`
- Z-index：`--z-dropdown` 100 → sticky 200 → modal-backdrop 300 → modal 400 → toast 500

## Components

- **page-card**：padding `--space-6`，radius `--radius-lg`
- **TaskGridCard**：`.status-badge--*` 走 `--status-*` token
- **GenerationTaskToolbar**：Primary 走 `action-buttons.css` 全局规则
- **Ant Design**：`colorPrimary: #0284c7`，`colorError/Warning/Success` 对齐 semantic token

## Do's and Don'ts

**Do**

- 新 CTA 使用 `--action-primary-gradient` 或 Ant `type="primary"`（自动覆盖）
- 状态/Tag 使用 `--semantic-*` 或 `--status-*`
- Dashboard 能力色引用 `--pill-*`

**Don't**

- 新页面硬编码 `#002FA7` 作按钮背景（品牌渐变终点除外）
- 散落 px 圆角（用 token）
- 全站大面积 backdrop-filter

## File Map

| 文件 | 职责 |
|------|------|
| `src/styles/tokens.css` | 品牌、action、semantic、pill、status |
| `src/styles/action-buttons.css` | Primary / Danger / Warning 按钮聚合 |
| `src/styles/dashboard-visual.css` | Dashboard hero + 标题扫光 + pills |
| `src/App.tsx` | Ant ConfigProvider 主题色 |
