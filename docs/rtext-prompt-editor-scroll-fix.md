# Rtext Prompt 编辑器：按回车后滚动跳到顶部 — 问题与修复方案

本文档供在 **Rtext 库**（如 `gientech/apps/Rtext`）中修复 **PromptTempDesigner** 组件时参考。调用方为 supermxmai 的 Admin 业务管理页（`web/src/pages/AdminBusiness.tsx`）。

---

## 一、现象

- 在 Admin 业务管理 → Prompt 页 → 任选 systemTemplate / userTemplate / outputFormatTemplate，在 **PromptTempDesigner** 里编辑内容。
- **按回车（Enter）换行时，编辑器视口会突然滚回顶部**，光标所在行被“顶”出视野，体验很差。
- 其他输入（如普通字符）有时也会伴随轻微跳动或光标/滚动异常。

---

## 二、原因分析

1. **调用方式（完全受控）**  
   Admin 侧使用方式为：
   ```tsx
   <PromptTempDesigner
     data={systemTemplateMarkup}
     onChange={(v: string) => setSystemTemplateMarkup(v)}
     styles={{ ... }}
   />
   ```
   即：`data` 来自父组件 state，每次 `onChange` 都调用 `setState`，父组件重渲染，并把新的 `data` 以 props 再传回 PromptTempDesigner。

2. **每次输入都触发父组件重渲染**  
   用户每按一次键（包括回车），`onChange` 触发 → 父组件 state 更新 → 整个 Admin 页面（含 PromptTempDesigner）重新渲染。

3. **Rtext 内部未在“受控重渲染”下保持视图状态**  
   - 若 PromptTempDesigner 在 `data` 变化时**用新 props 直接重建或重置了编辑器内容/实例**，会导致：
     - 滚动位置（scrollTop）被重置；
     - 选区/光标可能丢失或回到默认位置。
   - 若编辑器根节点或滚动容器的 DOM 被父组件重渲染**替换掉**（例如没有稳定的 key 或 ref），也会导致滚动容器重新挂载，滚动回到顶部。

结论：**在“完全受控 + 父组件每次输入都重渲染”的用法下，Rtext 没有保持编辑器内部的滚动位置（和 ideally 光标位置），导致“按回车就跳到顶部”等现象。**

---

## 三、修复目标

- 在**不改变**当前 Admin 侧“受控用法”的前提下，尽量在 **Rtext 的 PromptTempDesigner（及底层编辑器）** 内解决问题。
- 目标行为：用户按回车或继续输入时，**编辑器视口不要跳回顶部**，光标所在行应保持在可视区域内或至少不整页重置。

---

## 四、推荐方案（在 Rtext 库内实现）

### 4.1 减少“受控”带来的重渲染影响（核心）

- **内部维护一份“当前编辑内容”状态**（如 `localValue`），把 `props.data` 仅当作**初始值**或**外部同步源**：
  - 初始化：`localValue = props.data`。
  - 当 **props.data 与当前 localValue 不同且变化来自“外部”**（例如切换了任务模板）时，再同步：`setLocalValue(props.data)`；可通过 `props.data` 的引用或稳定 id 判断是否为“同一次编辑会话”的外部更新，避免每次父组件重渲染都覆盖本地输入。
- **用户输入时只更新 localValue**，并**节流/防抖**（例如 300–500ms）再调用 `props.onChange(localValue)`，这样父组件不会在每次按键时都重渲染，从根源上减少“父重渲 → 子被重置”的概率。
- 若必须保持“每次 onChange 都上报”，也应在组件内部**避免在 props.data 更新时无条件用 props.data 覆盖当前编辑内容**；仅在“真正切换了数据源”（例如 Admin 切换了编辑的模板类型或任务）时重置内容。

### 4.2 保持编辑器实例和滚动容器的稳定

- 使用 **useRef** 持有 Slate editor 或底层富文本编辑器实例，**不要**在每次渲染时新建；避免因父组件重渲染导致 editor 被重新创建。
- 编辑器外层**滚动容器**（如有）应使用 **ref** 或 **稳定 key**，确保父组件重渲染时该 DOM 节点不被替换；若当前结构是“滚动容器在 Rtext 内部”，则保证该容器不被上层替换即可。
- 若发现是**父级传入的 wrapper 或 className 导致整块 DOM 被替换**，可在 PromptTempDesigner 内部包一层带 **ref** 的 div，保证滚动容器始终挂在这一层，不随外部重渲染而重建。

### 4.3 在“内容被外部同步”时恢复滚动位置（可选增强）

- 当确实需要用 `props.data` 覆盖本地内容时（例如切换了模板），在更新内容后：
  - 使用 **requestAnimationFrame** 或 **setTimeout(..., 0)** 在下一帧读取当前光标/选区位置；
  - 调用 `scrollIntoView` 或设置 `scrollTop`，将光标所在块滚动到视口内，避免出现“内容变了、滚动条顶到顶”的体验。

### 4.4 其他建议

- **Slate**：若使用 Slate，确保在 React 重渲染时 **editor 对象稳定**（通过 useMemo/useRef 创建一次），且不因 `value` 从 props 灌入而整体替换 editor.children 导致失去选区；必要时在内部用“非受控 + 同步”的方式管理 value，再按 4.1 的方式节流上报。
- 若 Rtext 内部有 **ReactQuill** 或其它富文本组件，同样需要保证：**同一编辑会话内**不因父组件传入的 value 变化而重新 mount 或清空再赋值，否则滚动和光标都会丢。

---

## 五、验收方式

- 在 supermxmai 的 Admin 业务管理 → 打开某任务的 Prompt 页 → 在 systemTemplate（或任意一个模板）的 PromptTempDesigner 中：
  - 输入多行文字，使编辑器出现纵向滚动条；
  - 将光标移到**中间或偏下的某一行**；
  - **按回车**若干次。
- **预期**：视口不跳回顶部，光标所在行仍大致在可见范围内，或至少不会整页回到顶部。
- 保存后再次打开，内容应与最后编辑一致（受控同步仍然正确）。

---

## 六、调用方信息（供排查）

- **仓库**：supermxmai  
- **页面**：`web/src/pages/AdminBusiness.tsx`  
- **用法**：Prompt 标签下按 `activePromptType` 渲染一个 `PromptTempDesigner`，传入 `data={systemTemplateMarkup | userTemplateMarkup | outputFormatTemplateMarkup}`，`onChange` 对应 `setSystemTemplateMarkup` / `setUserTemplateMarkup` / `setOutputFormatMarkup`。
- **依赖**：`@mxmweb/rtext`（对应本地库路径如 `gientech/apps/Rtext` 打包产物）。

完成上述修改后，在 Rtext 中发布新版本，并在 supermxmai 的 `web` 中更新 `@mxmweb/rtext` 版本即可验证。
