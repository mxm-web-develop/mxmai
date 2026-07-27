# Writing Schema + Prompt 规范（索引）

## Canonical 文档（仓库内）

| 主题 | 路径 |
|------|------|
| Task v2 固定链路与 unifiedTemplate | `mxmcgi/src/tasks/README_TASK_V2_FIXED.md` |
| Task v2 总览与 formSchema | `mxmcgi/src/tasks/README.md` |
| 大纲：配置 vs writing-service 老逻辑 | `mxmcgi/src/tasks/OUTLINE-CONFIG-VS-CODE.md` |
| 提示词工程统一化（writing/graph 对比） | `mxmcgi/docs/PROMPT_ENGINEERING_UNIFICATION.md` |
| Bundle 类型定义 | `mxmcgi/src/routes/business-bundle-types.ts` |

## 典例文件

| 文件 | 说明 |
|------|------|
| `mxmcgi/src/tasks/examples/writing-outlines-tech-article.taskTemplate.json` | 仅 taskTemplate，便于迭代 prompt |
| `mxmcgi/src/tasks/examples/writing-outlines-tech-article.business.json` | 可 `apply:bundle` 的完整单条业务 |
| `mxmcgi/src/tasks/examples/writing-business-ad.taskTemplate.json` | 广告/品牌文案 taskTemplate |
| `mxmcgi/src/tasks/examples/writing-business-ad.business.json` | `type=business` `subtype=ad`，标签化纯文本输出 |

## 对比 Graph skill

| 项 | Writing | Graph |
|----|---------|-------|
| scope | `writing` | `graph` |
| 路由表 | `writing_scope_config` | `graph_scope_config` |
| 运行时 | `writing-service` | `graph-service` |
| 典型输出 | 文本 / JSON 大纲 | 图片 |
| 常见 extra | `taskTemplate` + `display` | + `promptTextTaskKey`、参考图槽位 |

上架操作步骤见同目录 **`SKILL.md`**。
