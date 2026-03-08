# Admin 控制台（Web）

基于 Vite + React + TypeScript 的 **Admin 控制台**：左侧导航 + 右侧内容区，集成**接口测试**与**提示词工程**管理。

## 界面结构

- **侧边栏**：控制台首页、接口测试（登录 / 角色 / 大纲 / 写作 / 任务 / 视频 / 图文 / 文本 / 音频 / 知识库 / 媒体 / 表单选项）、提示词工程（配置管理、索引说明）。
- **顶栏**：当前页标题、登录状态、退出。
- **主区**：当前页内容（首页为简要状态与快捷入口，其余为各功能表单与响应展示）。

## 功能总览

| 分类 | 页面 | 说明 |
|------|------|------|
| 控制台 | 首页 | 登录状态、Base URL、快捷入口说明。 |
| 接口测试 | 登录 | 配置 API Base URL，用户名/密码登录，JWT 带在后续请求头。 |
| | 角色 / 大纲 / 写作 / 任务 / 视频 | 全流程调试（大纲→写作→视频）及单接口测试。 |
| | 图文 / 文本 / 音频 / 知识库 / 媒体 / 表单选项 | 其余业务接口调试。 |
| 提示词工程 | 配置管理 | Admin 专用：GET 列表、GET by-key、PUT 新增/更新提示词配置（rules_i18n、output_format_i18n 等）。 |
| | 索引说明 | 配置文件路径（wtconfigs、graphconfigs）与优化流程说明。 |

## 启动

```bash
# 在仓库根目录
pnpm install
pnpm dev:web

# 或进入 web 目录
cd web
pnpm install
pnpm dev
```

浏览器打开 Vite 提供的地址（通常 `http://localhost:5173`）。

## 使用前准备

1. 启动 Gateway（端口 3000）及后端服务（mxmauth、mxmcgi 等）。
2. 在「登录」页：Base URL 留空时在开发环境会走当前域名（Vite 将 `/api` 代理到 `http://localhost:3000`）；也可直接填 `http://localhost:3000`。保存后登录。
3. 在各功能页发起请求、查看响应；需轮询结果时用「任务」页；需对照参数与提示词时用「表单选项」+「提示词工程」。

## 提示词优化

- 全系统 API 与模块说明、提示词配置文件路径：**`docs/系统全功能说明.md`**。
- Web 内「提示词工程」页提供配置文件索引与优化流程建议；修改 `mxmcgi/src/core/writing/wtconfigs/*.ts` 或 `mxmcgi/src/core/graph/graphconfigs/**/*.ts` 后重启 mxmcgi 生效。

## 相关文档

- 全流程测试（大纲→写作→视频）：`mxmcgi/doc_assets/全流程测试-大纲到视频.md`
- 视频带参考图示例：`mxmcgi/doc_assets/视频生成请求示例-带参考图.md`
