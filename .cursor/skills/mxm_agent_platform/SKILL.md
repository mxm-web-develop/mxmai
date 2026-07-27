---
name: mxm-agent-platform
description: >-
  通过 SuperMXMai 个人访问凭证调用平台 Task V2 业务与 Smartflow。适用于 OpenClaw、Cursor、
  Claude Code 等 Agent 代表用户生图、写作、跑工作流。触发：用户要调用 MXM 平台、SuperMXMai、
  mxm API、拉取平台能力目录。
---

# MXM Agent 平台调用（个人访问凭证）

> 业务是**动态**的，不要凭记忆猜参数。每次会话开始或用户指定业务前，先拉 **Catalog**。

> **本 Skill 面向 personal Key**：直连 Task V2 / Smartflow，计费扣 **Key 所属用户**。
> 第三方 Open API slug（`/api/v1/open/*`）属于 **integration Key** 场景，不在此 Catalog 中。

## 环境变量（必填）

| 变量 | 说明 |
|------|------|
| `MXM_BASE_URL` | Gateway 根地址，如 `https://api.example.com` 或本地 `http://localhost:3000` |
| `MXM_API_KEY` | 账号中心创建的 **个人访问凭证**（`mxm_` 前缀），勿提交 git |

鉴权 Header：`Authorization: Bearer $MXM_API_KEY`

## 1. 发现能力（Catalog）

```bash
node scripts/mxm-catalog.mjs
# 或
curl -sS "$MXM_BASE_URL/api/v1/agent/catalog" -H "Authorization: Bearer $MXM_API_KEY"
```

返回（`schemaVersion: 3`）：

- `taskV2[]` — 平台已上线 Task V2 业务（scope/taskKey/subtype + 字段摘要）
- `smartflows[]` — 你可执行的 Smartflow（自己的 + 公开 active）
- 每条业务含 `fields[]`、`paramsExample`；含参考图时另有 **`referenceImageSlots[]`**

**字段摘要**含 `required`、`fields[]`（name/type/title/uiType/enum）。完整 JSON Schema：

- Task V2：`GET {formConfigUrl}`
- Smartflow：catalog 已含 start 入参摘要；详情见 `GET /api/v1/smartflows/{id}`

## 2. 选型

| 场景 | 用法 |
|------|------|
| 单业务（生图、写作、视频等） | Task V2：`POST /api/v2/tasks/run` |
| 编排工作流 | Smartflow：`POST /api/v1/smartflows/{id}/execute` |

计费均扣 **Key 所属用户** 钱包。

## 3. 执行 Task V2

```http
POST /api/v2/tasks/run
Content-Type: application/json

{
  "scope": "writing",
  "taskKey": "business",
  "subtype": "ad",
  "params": { ...按 catalog.paramsExample / form-config 填写... }
}
```

轮询：`GET /api/v2/tasks/{taskId}`，间隔约 2s，直到 `status` 为 `completed` 或 `failed`。

异步 scope 可有 `parallel_count`（1～99，默认 1）。

## 4. 执行 Smartflow

```http
POST /api/v1/smartflows/{id}/execute
Content-Type: application/json

{
  "input_data": { ...按 catalog.paramsExample / fields 填写... }
}
```

轮询：`GET /api/v1/smartflow-tasks/{executionId}`

## 5. 参考图（必读）

> **不是 URL 字符串数组！** 每个槽位传 **`{ content, type }` 对象数组**，键名必须与 Catalog **`referenceImageSlots[].field`** 一致。

### 5.1 识别槽位

1. 在 Catalog 选中业务后，读 **`referenceImageSlots`**（非空即含参考图）
2. 若无该字段，再看 `fields[].uiType === "referenceImages"`
3. **禁止**凭记忆猜字段名（如 `clothing_images` vs `garment_images`）；以 Catalog 为准

| 用户说的 | 常见 field | 常见 itemTypeDefault |
|----------|------------|----------------------|
| 模特/人物 | `model_images` | `main-subject` |
| 服装/SKU | `garment_images` | `outfits` |
| 商品 | `product_images` | `main-subject` |
| 风格 | `style_images` | `style-reference` |
| 场景 | `environment_images` | `background` |

### 5.2 上传

```http
POST /api/v1/cgi/upload/assets?storageMode=temp
Authorization: Bearer $MXM_API_KEY
Content-Type: multipart/form-data

file=@/path/to/image.jpg
```

响应 `data.url`（或 `data.proxyPath` 拼 baseUrl）→ 填入下方 `content`。

### 5.3 传参格式

Task V2（`params`）或 Smartflow（`input_data`）：

```json
{
  "model_images": [
    { "content": "https://gateway.example.com/...", "type": "main-subject" }
  ],
  "garment_images": [
    { "content": "https://gateway.example.com/...", "type": "outfits" }
  ]
}
```

- `type` 优先用 Catalog **`referenceImageSlots[].itemTypeDefault`**
- 同一业务多个槽位：**人物进 model_*，服装进 garment_*，禁止混槽**
- 不要只传合并字段 `referenceImage`（除非 schema 无分槽）

### 5.4 提交前检查

- [ ] 每个 `referenceImageSlots[].required === true` 或 `minItems >= 1` 的槽位都有至少一张 `content`
- [ ] 本地/用户图片已 upload，content 为 http(s) URL
- [ ] 对照 `paramsExample` 结构与 `required` 列表

## 6. 错误处理

| HTTP | 含义 |
|------|------|
| 401 | Key 无效或过期 |
| 402 | 余额不足 |
| 400 | 参数 schema 校验失败，对照 catalog.paramsExample / form-config 修正 |
| 403 | integration Key 调用了非 open 路径（个人自动化需换 personal Key） |

## 7. Agent 工作流（推荐）

1. `GET /api/v1/agent/catalog`（或运行 `scripts/mxm-catalog.mjs`）
2. 根据用户意图匹配 `taskV2` 或 `smartflows` 条目
3. 读该条 **`referenceImageSlots`** 与 **`paramsExample`**；复杂字段再拉 `formConfigUrl`
4. **若有参考图**：逐槽位 upload → 组装 `{ content, type }` → 填入对应 field
5. 组 body（可复制 `run.bodyShape`）→ POST run/execute → 轮询至完成
6. 向用户展示结果 URL 或文本

更多细节见 [reference.md](reference.md)；安装见 [INSTALL.md](INSTALL.md)。
