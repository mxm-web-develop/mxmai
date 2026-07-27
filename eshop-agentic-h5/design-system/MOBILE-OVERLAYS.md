# 移动端弹层规范（H5）

> 参考 Apple Human Interface Guidelines（iOS 17+）Action Sheet / Alert 模式，适配本项目浅色商拍 UI。

## 硬性规则

| 禁止 | 必须使用 |
|------|----------|
| `window.confirm()` | `useMobileDialog().confirm()` |
| `window.alert()` | `useMobileDialog().alert()` |
| `window.prompt()` | 页面内 `input` / `BottomSheet` / `IosPickerField` |
| 浏览器原生 `beforeunload` 确认（除离页保护外） | 自定义 Bottom Sheet |

**原因**：原生对话框在 iOS/Android WebView 与桌面 Chrome 上样式不一致，破坏沉浸式移动端体验，且无法贴合品牌色与 safe-area。

## 组件选型

| 场景 | 组件 | 说明 |
|------|------|------|
| 二次确认（删除、清缓存） | `MobileDialogProvider` → `confirm()` | 底部 Action Sheet：说明区 + 主操作 + 独立「取消」条 |
| 单按钮告知（提交失败等） | `alert()` | 居中卡片，标题 + 说明 +「好」 |
| 表单 / 枚举选择 | `BottomSheet` | 自底部滑入，带 grabber 与 iOS 工具栏 |
| 轻量选项 | `IosPickerField` | 点击字段 → Bottom Sheet 滚轮 |

## `confirm()` 参数

```ts
await confirm({
  title?: string;           // 可选，小字标题
  message: string;          // 主文案，支持 \n 换行
  confirmLabel?: string;    // 默认「确定」
  cancelLabel?: string;     // 默认「取消」
  destructive?: boolean;    // 默认 true，主按钮红色（删除类）
});
// 返回 true = 用户点主操作，false = 取消或点遮罩
```

## `alert()` 参数

```ts
await alert({
  title?: string;           // 默认「提示」
  message: string;
  buttonLabel?: string;     // 默认「好」
});
```

## 布局与交互（iOS）

- **遮罩**：`bg-black/45` + 轻 blur，点击遮罩 = 取消（`confirm`）或关闭（`alert`）
- **圆角**：操作组 `rounded-2xl`，取消按钮单独一组，间距 `8px`（`space-y-2`）
- **字号**：操作按钮 `17px` semibold（与 iOS 系统 Action Sheet 接近）
- **破坏性操作**：`text-danger`，单独一层，不与取消同组
- **z-index**：`z-[100]`，高于 TabBar / BottomSheet（`z-50`）
- **滚动锁定**：打开时 `document.body.style.overflow = hidden`
- **动画**：遮罩 fade + 面板 `translate-y` 220–300ms
- **安全区**：容器 `safe-bottom`，左右 `px-3`

## 接入方式

根布局已包裹 `MobileDialogProvider`（`app/layout.tsx`）。在 Client Component 中：

```tsx
'use client';
import { useMobileDialog } from '@/contexts/MobileDialogContext';

const { confirm, alert } = useMobileDialog();
```

## 反模式

- 不要用 `confirm` 做长文案表单
- 不要叠两层 `confirm`（先关上一层再开下一层）
- 不要用 `alert` 代替 Toast 做成功提示（成功宜用页面内 inline 状态）

## 相关文件

- `src/contexts/MobileDialogContext.tsx` — Provider + 实现
- `src/components/schema/BottomSheet.tsx` — 表单型底部 sheet
