# Writing 系统升级测试用例

## 一、受影响的接口清单

### 1. 新增接口
- **GET /api/v1/writing/getformOptions** - 获取写作类型的表单选项配置

### 2. 受影响接口（参数提取逻辑改变）
- **POST /api/v1/writing/outline** - 生成大纲（支持 `maxDepth`, `expectedNodes`, `total_textcount`, `applyto` 等参数）
- **POST /api/v1/writing/generate** - 生成文章（支持动态参数提取）
- **POST /api/v1/writing/rewriting** - 重写文章
- **POST /api/v1/writing/polishing** - 润色文章

## 二、测试环境配置

### Base URL
```
http://localhost:3000/api/v1/writing
```

### Headers（所有请求都需要）
```
x-user-id: test-user-123
Content-Type: application/json
```

## 三、测试用例

### 测试组 1: 新增 getformOptions 接口

#### 1.1 获取 articles 类型的表单选项（中文）
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=articles&lang=zh
```

**预期响应：**
```json
{
  "success": true,
  "data": {
    "writingType": "articles",
    "language": "zh",
    "options": {
      "stance": [
        { "value": "neutral", "label": "中立客观", "labelEn": "Neutral" },
        { "value": "supportive", "label": "支持赞同", "labelEn": "Supportive" },
        { "value": "critical", "label": "批判质疑", "labelEn": "Critical" }
      ],
      "tone": [...],
      "length": [...],
      "key_elements": [...],
      "_metadata": {
        "motivation": {
          "type": "textarea",
          "label": "写作动机",
          "placeholder": "请描述写作的动机和目的...",
          "helpText": "说明为什么要写这篇文章，想要达到什么目的"
        },
        "key_elements": {
          "type": "multi-select",
          "label": "关键要素",
          "helpText": "选择文章需要包含的关键要素"
        }
      }
    }
  }
}
```

#### 1.2 获取 articles 类型的表单选项（英文）
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=articles&lang=en
```

#### 1.3 获取 outlines 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=outlines&lang=zh
```

**预期参数：**
- `maxDepth` (select): 一级标题、二级标题、三级标题、四级标题
- `applyto` (select): 应用于（articles, lyrics, media-post, storyboard-scripts, reviews, resumes, voice-scripts）
- `expectedNodes` (number): 期望节点数（1-100）
- `total_textcount` (number): 文字总量（100-100000），将根据 applyto 类型和节点重要性进行智能分布（重点章节分配更多字数）

#### 1.4 获取 storyboard-scripts 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=storyboard-scripts&lang=zh
```

**预期参数：**
- `sceneCount` (number)
- `characterCount` (number)
- `dialogueStyle` (select)
- `genre` (select)
- `duration` (select)
- `targetAudience` (select)
- `adType` (select)
- `productInfo` (textarea)
- `callToAction` (text)
- `adLength` (select)

#### 1.5 获取 resumes 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=resumes&lang=zh
```

#### 1.6 获取 lyrics 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=lyrics&lang=zh
```

#### 1.7 获取 media-post 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=media-post&lang=zh
```

#### 1.8 获取 reviews 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=reviews&lang=zh
```

#### 1.9 获取 voice-scripts 类型的表单选项
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=voice-scripts&lang=zh
```

#### 1.10 错误测试 - 缺少 writing_type
**请求：**
```http
GET /api/v1/writing/getformOptions?lang=zh
```

**预期响应：**
```json
{
  "success": false,
  "error": "Missing writing_type parameter",
  "message": "Please specify writing_type (e.g., articles, outlines, lyrics)"
}
```

#### 1.11 错误测试 - 无效的 writing_type
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=invalid-type&lang=zh
```

**预期响应：**
```json
{
  "success": false,
  "error": "Form options not found",
  "message": "Form options for writing_type \"invalid-type\" are not available"
}
```

#### 1.12 错误测试 - 无效的语言参数
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=articles&lang=fr
```

**预期响应：**
```json
{
  "success": false,
  "error": "Invalid language parameter",
  "message": "lang must be \"zh\" or \"en\""
}
```

---

### 测试组 2: outline 接口测试

#### 2.1 生成 articles 类型大纲（使用新参数）
**请求：**
```http
POST /api/v1/writing/outline
```

**Body：**
```json
{
  "uid": "test-outline-1",
  "prompt": "人工智能的发展历程",
  "writing_type": "articles",
  "maxDepth": 3,
  "expectedNodes": 15,
  "total_textcount": 6000,
  "applyto": "articles"
}
```

**验证点：**
- 大纲生成成功
- 大纲深度符合 maxDepth 要求
- 节点数量大致符合 expectedNodes
- total_textcount 参数被正确提取和应用（根据 applyto 类型和节点重要性智能分配字数）
- applyto 参数指定了大纲将用于生成 articles 类型内容

#### 2.2 生成 outlines 类型大纲（使用 outlines 特有参数）
**请求：**
```http
POST /api/v1/writing/outline
```

**Body：**
```json
{
  "uid": "test-outline-2",
  "prompt": "产品开发流程",
  "writing_type": "outlines",
  "maxDepth": 2,
  "expectedNodes": 10,
  "total_textcount": 5000,
  "applyto": "articles"
}
```

**验证点：**
- 大纲生成成功
- 大纲深度符合 maxDepth 要求
- 节点数量大致符合 expectedNodes
- total_textcount 参数被正确提取和应用
- applyto 参数指定了大纲将用于生成 articles 类型内容

#### 2.3 向后兼容测试 - 不传 writing_type（应使用默认 articles）
**请求：**
```http
POST /api/v1/writing/outline
```

**Body：**
```json
{
  "uid": "test-outline-3",
  "prompt": "科技发展趋势"
}
```

**验证点：**
- 应使用默认的 articles 类型
- 应使用默认参数列表（motivation, stance, tone, length, key_elements）

#### 2.4 向后兼容测试 - 使用旧参数格式（通用参数）
**请求：**
```http
POST /api/v1/writing/outline
```

**Body：**
```json
{
  "uid": "test-outline-4",
  "prompt": "环保主题",
  "writing_type": "articles",
  "motivation": "科普环保知识",
  "stance": "supportive",
  "tone": "professional",
  "length": "medium",
  "key_elements": ["data", "examples"]
}
```

**验证点：**
- 旧参数格式应正常工作
- 参数应正确提取并应用到 prompt 中

---

### 测试组 3: generate 接口测试（核心测试）

#### 3.1 生成 articles 类型文章（使用新参数）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇关于人工智能的文章",
  "writing_type": "articles",
  "motivation": "向读者介绍 AI 的发展",
  "stance": "supportive",
  "tone": "professional",
  "length": "medium",
  "key_elements": ["data", "examples", "analysis"]
}
```

**说明：**
- `outputFormat` 参数**可选**，默认使用异步任务模式（'json'）
  - **不传此参数**：使用异步任务模式，返回 `{ success: true, data: { taskId, status } }`，需要轮询查询结果
  - 传 `"json"`：同上，异步任务模式
  - 传 `"stream"`：使用流式输出模式（SSE），实时返回生成内容
  - **自动判断**：如果 `storeToMinio === false`，会自动使用流式模式
- `enable_markdown` 参数已废弃，系统会根据 `writing_type` 自动判断
  - `articles` 类型默认使用 Markdown 格式输出
  - `outlines` 类型返回 JSON 格式（不涉及 Markdown）

**验证点：**
- 文章生成成功
- 参数正确提取（只提取 articles 类型的参数）
- 生成的文本不应包含参数名称（如"动机：xxx"）

#### 3.2 生成 outlines 类型大纲（使用 outlines 特有参数）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "生成产品开发流程大纲",
  "writing_type": "outlines",
  "maxDepth": 3,
  "expectedNodes": 12,
  "total_textcount": 8000,
  "applyto": "articles",
  "storeToMinio": false
}
```

**说明：**
- `writing_type: "outlines"` 时，系统会自动调用 `generateOutline` 函数
- 即使不传 `storeToMinio: false`，系统也会自动设置为 `false`（不存储到 MinIO）
- 返回 JSON 格式的 Outline 对象，而不是文本内容

**预期响应格式（异步任务模式）：**
```json
{
  "success": true,
  "data": {
    "taskId": "task-123",
    "status": "pending"
  }
}
```

**任务完成后，查询任务结果（GET /api/v1/cgi/tasks/:taskId）应返回：**
```json
{
  "success": true,
  "data": {
    "taskId": "task-123",
    "status": "completed",
    "result": {
      "outline": {
        "uid": "outline-xxx",
        "content": "产品开发流程",
        "children": [
          {
            "uid": "section-1",
            "content": "第一章：需求分析",
            "children": [...]
          }
        ]
      },
      "metadata": {
        "type": "outlines",
        "uid": "outline-xxx",
        "outline": { ... }
      }
    }
  }
}
```

**验证点：**
- 只提取 outlines 类型的参数（maxDepth, expectedNodes, total_textcount, applyto）
- 不应提取 articles 类型的参数（即使传了也会被忽略）
- total_textcount 参数被正确提取，根据 applyto 类型和节点重要性智能分配字数
- applyto 参数指定了大纲将用于生成 articles 类型内容
- **重要**：outlines 类型返回 JSON 格式（Outline 对象），存储在 `result.outline` 和 `result.metadata.outline` 中
- **重要**：outlines 类型不存储到 MinIO（自动设置 `storeToMinio: false`）
- **重要**：返回格式与 `/api/v1/writing/outline` 接口一致，结果包含在任务结果的 `outline` 字段中

#### 3.3 生成 storyboard-scripts 类型（使用分镜脚本参数）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "创作一个产品宣传广告脚本",
  "writing_type": "storyboard-scripts",
  "sceneCount": 5,
  "characterCount": 3,
  "dialogueStyle": "natural",
  "genre": "commercial",
  "duration": "short",
  "targetAudience": "general",
  "adType": "video",
  "productInfo": "一款智能手表，具有健康监测、运动追踪等功能",
  "callToAction": "立即购买",
  "adLength": "30s"
}
```

**验证点：**
- 所有 storyboard-scripts 参数都被正确提取
- 生成的脚本符合参数要求

#### 3.4 生成 resumes 类型（使用简历参数）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "生成一份软件工程师简历",
  "writing_type": "resumes",
  "workYears": "5-10",
  "industry": "tech",
  "skillFocus": ["technical", "management"],
  "targetPosition": "高级软件工程师",
  "highlightAchievements": "主导开发了多个大型项目，提升了系统性能30%"
}
```

#### 3.5 生成 lyrics 类型（使用歌词参数）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "创作一首关于青春的歌曲",
  "writing_type": "lyrics",
  "musicStyle": "pop",
  "emotion": "energetic",
  "rhyme": "full",
  "length": "medium",
  "theme": "青春、梦想、奋斗"
}
```

#### 3.6 生成 lyrics 类型歌词（Suno 格式）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "创作一首关于青春的歌曲",
  "writing_type": "lyrics",
  "musicStyle": "pop",
  "emotion": "energetic",
  "rhyme": "full",
  "length": "medium",
  "theme": "青春、梦想、奋斗",
  "format": "suno"
}
```

**验证点：**
- 歌词生成成功
- 输出为纯文本格式，不包含任何 Markdown 符号（如 #、*、-、`、[] 等）
- 歌词结构完整（主歌、副歌等）
- 每行歌词独立成行
- 段落之间使用空行分隔
- 如果标注段落类型，使用简单文字标注（如"主歌"、"副歌"），不使用方括号

**说明：**
- `format: "suno"` 表示使用 Suno AI 格式，输出纯文本歌词
- 系统会自动禁用 Markdown 格式
- 遵循 Suno AI 的提示词规则和格式要求

#### 3.7 生成 lyrics 类型歌词（默认格式）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "创作一首关于青春的歌曲",
  "writing_type": "lyrics",
  "musicStyle": "pop",
  "emotion": "energetic",
  "rhyme": "full",
  "length": "medium",
  "theme": "青春、梦想、奋斗",
  "format": "default"
}
```

**验证点：**
- 歌词生成成功
- 输出为 Markdown 格式（可以使用 Markdown 语法）
- 歌词结构完整（主歌、副歌等）
- 可以使用 Markdown 标注段落类型（如：[主歌1]、[副歌]）

**说明：**
- `format: "default"` 或不传 `format` 参数，使用默认 Markdown 格式
- 与其他写作类型一样，输出 Markdown 格式的歌词

#### 3.8 参数隔离测试 - 传递其他类型的参数应被忽略
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇文章",
  "writing_type": "articles",
  "motivation": "科普知识",
  "stance": "neutral",
  "sceneCount": 10,
  "workYears": "5-10",
  "maxDepth": 3
}
```

**验证点：**
- 只提取 articles 类型的参数（motivation, stance）
- sceneCount, workYears, maxDepth 应被忽略（不属于 articles 类型）

#### 3.7 向后兼容测试 - 不传 writing_type（使用默认 articles）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇文章",
  "motivation": "科普知识",
  "stance": "neutral",
  "tone": "professional",
  "length": "medium",
  "key_elements": ["data"]
}
```

**验证点：**
- 应使用默认的 articles 类型
- 参数应正确提取

#### 3.8 带大纲的生成测试（大纲参数应优先）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "根据大纲生成文章",
  "writing_type": "articles",
  "outlines": [
    {
      "uid": "section-1",
      "content": "第一章：引言",
      "motivation": "引入主题",
      "stance": "neutral"
    },
    {
      "uid": "section-2",
      "content": "第二章：正文",
      "tone": "professional"
    }
  ],
  "motivation": "这个参数应该被忽略（因为提供了大纲）"
}
```

**验证点：**
- 使用大纲中的参数，而不是全局参数
- 每个段落使用自己的参数

#### 3.9 知识库功能测试（确保不受影响）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇关于人工智能的文章",
  "writing_type": "articles",
  "motivation": "科普知识",
  "stance": "neutral",
  "knowledgeBase": [
    {
      "knowledgeBaseId": "kb-123",
      "query": "人工智能发展",
      "limit": 5
    }
  ],
  "process_style": "silent"
}
```

**验证点：**
- 知识库功能正常工作
- 参数提取不影响知识库逻辑
- 知识库内容正确整合到 prompt 中

---

### 测试组 4: rewriting 接口测试

#### 4.1 重写 articles 类型文章
**请求：**
```http
POST /api/v1/writing/rewriting
```

**Body：**
```json
{
  "prompt": "重写以下文章，使其更加专业",
  "writing_type": "articles",
  "previous_content": "这是一篇需要重写的文章内容...",
  "previous_task": "原始任务描述"
}
```

**验证点：**
- 重写功能正常
- writing_type 参数被正确识别

---

### 测试组 5: polishing 接口测试

#### 5.1 润色 articles 类型文章（使用参数）
**请求：**
```http
POST /api/v1/writing/polishing
```

**Body：**
```json
{
  "prompt": "润色以下文章",
  "writing_type": "articles",
  "previous_content": "需要润色的文章内容...",
  "previous_task": "原始任务",
  "motivation": "提升文章质量",
  "stance": "supportive",
  "tone": "professional",
  "length": "medium",
  "key_elements": ["examples"]
}
```

**验证点：**
- 参数正确提取
- 润色功能正常

---

### 测试组 6: 流式输出测试

#### 6.1 流式生成 articles 类型文章
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇文章",
  "writing_type": "articles",
  "motivation": "科普知识",
  "stance": "neutral",
  "outputFormat": "stream"
}
```

**说明：**
- 传 `"outputFormat": "stream"` 使用流式输出模式
- 或者传 `"storeToMinio": false` 也会自动使用流式模式

**验证点：**
- 流式输出正常
- 参数正确应用

---

### 测试组 7: 边界情况测试

#### 7.1 空参数测试
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇文章",
  "writing_type": "articles"
}
```

**验证点：**
- 即使不传任何业务参数，也应正常生成

#### 7.2 部分参数测试
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇文章",
  "writing_type": "articles",
  "motivation": "只传了动机参数"
}
```

**验证点：**
- 只提取已传递的参数
- 不应报错

#### 7.3 数组参数测试（key_elements）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "写一篇文章",
  "writing_type": "articles",
  "key_elements": ["data", "examples", "quotes"]
}
```

**验证点：**
- 数组参数正确提取
- 在 prompt 中正确格式化（用"、"连接）

#### 7.4 数字参数测试（outlines 的 expectedNodes 和 total_textcount）
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "生成大纲",
  "writing_type": "outlines",
  "maxDepth": 3,
  "expectedNodes": 20,
  "total_textcount": 10000,
  "applyto": "articles"
}
```

**验证点：**
- 数字参数（expectedNodes, total_textcount）正确提取
- 在 prompt 中正确格式化
- applyto 参数正确提取和应用

---

### 测试组 8: 类型迁移测试（movie-scripts 和 ad-scripts）

#### 8.1 测试旧的 movie-scripts 类型（应返回错误或使用默认）
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=movie-scripts&lang=zh
```

**预期：**
- 应返回 404 或使用默认配置

#### 8.2 测试旧的 ad-scripts 类型（应返回错误或使用默认）
**请求：**
```http
GET /api/v1/writing/getformOptions?writing_type=ad-scripts&lang=zh
```

**预期：**
- 应返回 404 或使用默认配置

#### 8.3 使用新的 storyboard-scripts 类型
**请求：**
```http
POST /api/v1/writing/generate
```

**Body：**
```json
{
  "prompt": "创作一个电影剧本",
  "writing_type": "storyboard-scripts",
  "sceneCount": 10,
  "characterCount": 5,
  "dialogueStyle": "dramatic",
  "genre": "drama",
  "duration": "feature",
  "targetAudience": "adult"
}
```

---

## 四、Postman 测试集合结构

建议按以下结构组织 Postman Collection：

```
Writing System Upgrade Tests
├── 1. getformOptions API
│   ├── 1.1 Get articles form options (zh)
│   ├── 1.2 Get articles form options (en)
│   ├── 1.3 Get outlines form options
│   ├── 1.4 Get storyboard-scripts form options
│   ├── 1.5 Get resumes form options
│   ├── 1.6 Get lyrics form options
│   ├── 1.7 Get media-post form options
│   ├── 1.8 Get reviews form options
│   ├── 1.9 Get voice-scripts form options
│   ├── 1.10 Error: Missing writing_type
│   ├── 1.11 Error: Invalid writing_type
│   └── 1.12 Error: Invalid language
├── 2. Outline API
│   ├── 2.1 Generate articles outline (new params)
│   ├── 2.2 Generate outlines outline (outlines params)
│   ├── 2.3 Backward compatibility: No writing_type
│   └── 2.4 Backward compatibility: Old params format
├── 3. Generate API (Core)
│   ├── 3.1 Generate articles (new params)
│   ├── 3.2 Generate outlines (outlines params)
│   ├── 3.3 Generate storyboard-scripts
│   ├── 3.4 Generate resumes
│   ├── 3.5 Generate lyrics
│   ├── 3.6 Parameter isolation test
│   ├── 3.7 Backward compatibility: No writing_type
│   ├── 3.8 Generate with outlines
│   └── 3.9 Knowledge base test
├── 4. Rewriting API
│   └── 4.1 Rewrite articles
├── 5. Polishing API
│   └── 5.1 Polish articles (with params)
├── 6. Stream Output
│   └── 6.1 Stream generate articles
├── 7. Edge Cases
│   ├── 7.1 Empty params
│   ├── 7.2 Partial params
│   ├── 7.3 Array params
│   └── 7.4 Number params
└── 8. Type Migration
    ├── 8.1 Old movie-scripts (should fail)
    ├── 8.2 Old ad-scripts (should fail)
    └── 8.3 New storyboard-scripts
```

## 五、关键验证点总结

### 5.1 功能验证
- ✅ 所有 writing_type 都能正确获取表单选项
- ✅ 参数提取只提取对应类型的参数
- ✅ 参数正确应用到 prompt 中
- ✅ 生成的文本不包含参数名称

### 5.2 向后兼容性验证
- ✅ 不传 writing_type 时使用默认 articles
- ✅ 旧参数格式（motivation, stance 等）仍能正常工作
- ✅ 现有 API 接口不受影响

### 5.3 知识库功能验证
- ✅ 知识库检索功能正常
- ✅ 知识库内容正确整合
- ✅ 参数提取不影响知识库逻辑

### 5.4 类型系统验证
- ✅ storyboard-scripts 类型正常工作
- ✅ 旧的 movie-scripts 和 ad-scripts 已移除
- ✅ 所有新类型配置完整

## 六、测试优先级

### P0（必须测试）
- getformOptions 接口（所有类型）
- generate 接口（articles, outlines, storyboard-scripts）
- outline 接口（包含新参数：total_textcount, applyto）
- 向后兼容性测试
- 知识库功能测试

### P1（重要测试）
- 其他 writing_type 的 generate 测试
- outline 接口测试
- 参数隔离测试

### P2（可选测试）
- rewriting 和 polishing 接口
- 流式输出测试
- 边界情况测试

## 七、常见问题排查

### 问题 1: 参数没有被提取
**检查：**
- writing_type 是否正确
- 参数名是否在对应类型的参数列表中
- 参数值是否为空或 undefined
- 对于 outlines 类型，确保使用了正确的参数名（maxDepth, expectedNodes, total_textcount, applyto）

### 问题 2: 表单选项返回 null
**检查：**
- writing_type 是否正确
- 配置文件中是否实现了 getFormOptions 方法

### 问题 3: 知识库功能异常
**检查：**
- knowledgeBase 参数是否正确传递
- process_style 设置是否正确
- 知识库 ID 是否存在

### 问题 4: 向后兼容性问题
**检查：**
- 不传 writing_type 时是否使用默认值
- 旧参数格式是否仍能工作
