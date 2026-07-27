# MXM Agent 平台 — 参考

## Catalog 响应结构（schemaVersion 3，personal）

```json
{
  "schemaVersion": 3,
  "audience": "personal",
  "generatedAt": "ISO8601",
  "baseUrl": "https://gateway",
  "endpoints": {
    "upload": "https://gateway/api/v1/cgi/upload/assets?storageMode=temp"
  },
  "taskV2": [
    {
      "scope": "graph",
      "taskKey": "eshop",
      "subtype": "clothes",
      "taskLabel": "电商",
      "subtypeLabel": "服装商拍",
      "required": ["garment_images"],
      "fields": [
        {
          "name": "model_images",
          "type": "array",
          "title": "模特参考",
          "uiType": "referenceImages",
          "itemTypeDefault": "main-subject",
          "required": false
        },
        {
          "name": "garment_images",
          "type": "array",
          "title": "服装 SKU 参考",
          "uiType": "referenceImages",
          "itemTypeDefault": "outfits",
          "minItems": 1,
          "required": true
        }
      ],
      "referenceImageSlots": [
        {
          "field": "model_images",
          "title": "模特参考",
          "required": false,
          "maxItems": 8,
          "itemTypeDefault": "main-subject",
          "agentHint": "模特/人物照片放此槽；禁止把服装 SKU 图放这里"
        },
        {
          "field": "garment_images",
          "title": "服装 SKU 参考",
          "required": true,
          "minItems": 1,
          "itemTypeDefault": "outfits",
          "agentHint": "服装 SKU 平铺/挂拍图放此槽；禁止把模特照片放这里"
        }
      ],
      "paramsExample": {
        "garment_images": [
          { "content": "https://example.com/uploaded-image.jpg", "type": "outfits" }
        ],
        "model_images": [
          { "content": "https://example.com/uploaded-image.jpg", "type": "main-subject" }
        ]
      },
      "formConfigUrl": "/api/v2/tasks/form-config?scope=graph&taskKey=eshop&subtype=clothes",
      "run": {
        "method": "POST",
        "path": "/api/v2/tasks/run",
        "bodyShape": {
          "scope": "graph",
          "taskKey": "eshop",
          "subtype": "clothes",
          "params": { "...": "同 paramsExample" }
        }
      },
      "poll": { "method": "GET", "pathTemplate": "/api/v2/tasks/{taskId}" }
    }
  ],
  "smartflows": []
}
```

不含 `publishedSlugs`：第三方 Open API 由 **integration Key** + `GET /api/v1/open/{slug}` 对接，见 `docs/API_OPEN_PUBLISH.md`。

## Task V2 scope 一览

| scope | 典型用途 |
|-------|----------|
| writing | 文章、文案、脚本 |
| graph | 生图、设计、商拍 |
| video | 视频生成 |
| audio / music | 音频 |
| outline | 大纲 |
| text | 同步文本 LLM |

## 上传参考图

```http
POST /api/v1/cgi/upload/assets?storageMode=temp
Authorization: Bearer mxm_...
Content-Type: multipart/form-data

file=@/path/to/image.jpg
```

响应示例：

```json
{
  "success": true,
  "data": {
    "url": "https://gateway.example.com/api/v1/media/...",
    "proxyPath": "/api/v1/media/..."
  }
}
```

将 `data.url`（或 baseUrl + `proxyPath`）填入 params 槽位的 **`content`**。

## 参考图 params 格式

```json
{
  "model_images": [{ "content": "https://...", "type": "main-subject" }],
  "garment_images": [{ "content": "https://...", "type": "outfits" }]
}
```

**错误示例**（会导致校验失败或语义错乱）：

```json
{
  "model_images": ["https://..."],
  "garment_images": ["https://..."]
}
```

字段名 alias：部分旧业务用 `clothing_images`，新 eshop 用 `garment_images`；**以 Catalog `referenceImageSlots[].field` 为准**，勿猜。

## 相关文档

- 个人 API Key：`docs/user-api-key-design.md`
- 开放 API（integration Key）：`docs/API_OPEN_PUBLISH.md`
- Task V2：`mxmcgi/src/tasks/README.md`
- Graph 参考图 schema 规范：`mxmcgi/docs/GRAPH_SCHEMA_AND_PROMPT_REFERENCE.md`
