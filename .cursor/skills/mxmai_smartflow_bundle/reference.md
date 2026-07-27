# Smartflow bundle 参考索引

## API

| 方法 | 路径 | Body / Query |
|------|------|----------------|
| GET | `/api/v1/smartflows/bundle?id={flowId}` | 导出单条 |
| POST | `/api/v1/smartflows/bundle/export` | `{ "ids": ["flow-a", "flow-b"] }` |
| POST | `/api/v1/smartflows/bundle/import` | `{ "bundle": {...}, "conflictPolicy": "upsert" \| "skip" \| "dry-run" }` |

## CLI

```bash
cd mxmcgi
pnpm run apply:smartflow-bundle -- src/smartflow/examples/eshop-clothes-batch-v1.smartflow.json
pnpm run apply:smartflow-bundle -- path/to/x.smartflow.json --dry-run
pnpm run seed:eshop-smartflow-batch   # 从 TS 预置流写入 DB
```

## 与 business bundle 的关系

- Smartflow bundle **不**内嵌业务 formSchema / unifiedTemplate。  
- 仅引用 `business_scope` + `taskKey` + `subtype`；须先 `mxm-business-bundle` 导入业务。

## 模板

见同目录 `templates/smartflow-bundle-item.stub.json`。
