# Expert 调研能力 + PPT/PDF 写作能力集成设计方案

**状态**: 设计草案
**作者**: Hermes Agent
**日期**: 2026-04-22

---

## 一、背景与目标

### 1.1 已有能力

- **Expert 调研**: Hermes Agent 独立工作站的深度调研workflow（多维度调研 → 深度分析 → 长文写作MD/PDF → PPT生成，含演讲稿）
- **SuperMXMai**: 多模态AI内容生成SaaS平台，6个微服务，pnpm monorepo，完整的任务系统和provider架构

### 1.2 集成目标

将 Expert 的**调研 + 长文写作 + PPT生成 + PDF生成**能力，以**服务化**方式集成进 SuperMXMai，形成：

```
用户发起请求
    ↓
Smartflow 编排（节点：model / tools / recall / formatter）
    ↓
Expert Engine（调研 → 写作 → 输出）
    ↓
PPT/PDF 生成任务（TaskExecutor 管理进度）
    ↓
结果存储（MinIO）→ 通知用户
```

### 1.3 核心价值

- **降低使用门槛**: 用户无需会写 Prompt，通过可视化 Smartflow 配置即可使用完整的调研写作能力
- **任务可追踪**: 所有调研写作任务通过 TaskExecutor 管理，可查看进度、历史记录
- **可组合**: 调研结果 → PPT，可按需拼接进其他 Smartflow
- **可扩展**: 未来可添加"网页发布"、"邮件推送"等后续节点

---

## 二、架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Web)                          │
│  SmartflowDesigner │ TaskHistory │ MediaGallery │ PPT/PDF Preview │
└────────────┬────────────────┬──────────────────┬────────────────┘
             │                │                  │
             │  /api/v1/generation/pptx  POST   │
             │  /api/v1/generation/pdf    POST │
             │  /api/v1/generation/report POST │  ← 新增路由
             │                │                  │
┌────────────▼────────────────▼──────────────────▼────────────────┐
│                      Gateway (:3000)                             │
│  /api/v1/generation/*  → 路由到 mxmcgi                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      mxmcgi (:4003)                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 新增路由      │  │ ExpertEngine │  │ PPT/PDF Provider    │  │
│  │ /pptx        │  │              │  │                      │  │
│  │ /pdf         │  │ 调研流程     │  │ pptxgenjs (server)  │  │
│  │ /report      │  │ 长文写作     │  │ pandoc + Chrome     │  │
│  └──────┬───────┘  │ PPT生成      │  │ DeerAPI/MiniMax(图) │  │
│         │          └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                    │
│  ┌──────▼─────────────────▼─────────────────────────────────┐  │
│  │              TaskExecutor (已有框架)                       │  │
│  │  任务创建 → 进度追踪 → 状态更新 → 结果存储 MinIO           │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                         MinIO (S3)                               │
│   generation_tasks / media_assets 表存储文件 URL                 │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  mxmnotify (:4005) ← 任务完成通知 (已有)                         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 三种集成模式

| 模式 | 描述 | 适用场景 | 实现方式 |
|------|------|----------|----------|
| **模式A: Smartflow 节点** | Expert能力封装为 `expert` / `pptx` / `pdf` 节点类型 | 需要可视化编排的复杂工作流 | mxmcgi 新增节点类型 |
| **模式B: 独立 API** | `/api/v1/generation/pptx` 等独立接口 | 直接生成PPT/PDF，不需要编排 | mxmcgi 新增路由和 Provider |
| **模式C: 混合** | API + Smartflow 节点组合 | 实际推荐方案 | 模式A + 模式B |

**推荐: 模式C（混合方案）**

---

## 三、详细设计

### 3.1 新增 API 路由（mxmcgi）

```
POST /api/v1/generation/report
  Body: {
    type: "research_report",
    topic: "人工智能在金融风控中的应用",
    depth: "comprehensive",  // quick / standard / comprehensive
    dimensions: ["技术分析", "市场格局", "风险挑战"],
    output: ["pdf", "pptx"],  // 输出格式
    slides: 15,  // PPT页数
    coverImage: { prompt: "...", provider: "deerapi" }
  }
  Response: { taskId: "xxx" }

POST /api/v1/generation/pptx
  Body: {
    content: "...",  // MD格式或结构化JSON
    slides: [...],   // 或直接传幻灯片数组
    style: "bold_typography",  // bold_typography / geometric / glassmorphism
    coverImage: { prompt: "...", model: "gemini-3.1-flash-image-preview" }
  }

POST /api/v1/generation/pdf
  Body: {
    content: "...",  // MD格式
    title: "报告标题",
    author: "作者",
    toc: true,
    cover: true
  }

GET  /api/v1/generation/tasks/:taskId   ← 已有，复用

GET  /api/v1/generation/tasks?type=pptx
GET  /api/v1/generation/tasks?type=pdf
GET  /api/v1/generation/tasks?type=research_report
```

### 3.2 ExpertEngine 服务

**位置**: `mxmcgi/src/expert/`

```
mxmcgi/src/expert/
├── ExpertEngine.ts          # 核心引擎，编排调研+写作流程
├── ResearchAgent.ts         # 调研Agent（调用搜索工具）
├── ReportWriter.ts          # 长文写作（调用LLM）
├── SlideGenerator.ts        # PPT结构生成（调用LLM）
├── PptxProvider.ts          # PPTX生成（调用pptxgenjs）
├── PdfProvider.ts           # PDF生成（调用pandoc + Chrome）
├── ImageProvider.ts         # 封面图生成（复用现有 DeerAPI/MiniMax）
└── types.ts                 # 类型定义
```

**ExpertEngine 核心流程**:

```
用户请求 (report / pptx / pdf)
    │
    ▼
Step 1: 调研（ResearchAgent）
    ├─ 维度调研（并行）: 背景现状 / 技术分析 / 市场格局 / 风险挑战 / 趋势展望
    ├─ 搜索数据源: arXiv / 艾瑞/头豹/36氪 / GitHub / Bloomberg
    └─ 输出: 结构化调研数据 (JSON)
    │
    ▼
Step 2: 长文写作（ReportWriter）← 仅当输出包含 PDF 时
    ├─ 生成 MD 格式深度报告（5000-15000字）
    └─ 输出: MD 文本
    │
    ▼
Step 3: PPT 生成（SlideGenerator + PptxProvider）
    ├─ 分析报告内容 → 生成幻灯片结构（JSON数组）
    ├─ 生成封面图（调用 DeerAPI/MiniMax）
    └─ 生成 PPTX 文件（pptxgenjs）
    │
    ▼
Step 4: PDF 生成（PdfProvider）← 仅当输出包含 PDF 时
    ├─ 将 MD 转换为 HTML（pandoc）
    ├─ 生成封面页
    ├─ 添加目录（--toc）
    └─ Chrome 无头模式 → PDF
    │
    ▼
Step 5: 存储 + 通知
    ├─ 文件上传 MinIO
    ├─ 更新 media_assets 表
    └─ 触发 mxmnotify 通知
```

### 3.3 PPT/PDF Provider 设计

**复用现有 Provider 架构**:

```typescript
// mxmcgi/src/models/providers.ts 已有的 Provider 模式
// 新增以下 Provider:

// PptxProvider - 服务端 PPTX 生成（无需外部API）
class PptxProvider {
  async generate(modelKey: string, params: PptxGenerateParams): Promise<GenerateResult>
  // 使用 pptxgenjs，不依赖外部API
  // 支持: bold_typography / geometric / glassmorphism 样式
  // 支持: 传入 MD 或结构化 JSON
}

// PdfProvider - 服务端 PDF 生成（无需外部API）
class PdfProvider {
  async generate(modelKey: string, params: PdfGenerateParams): Promise<GenerateResult>
  // 使用 pandoc + Chrome（无头模式）
  // 支持: 封面 / 目录 / 页眉页脚
}

// ExpertReportProvider - 调研报告生成（调用 LLM + 搜索）
class ExpertReportProvider {
  async generate(modelKey: string, params: ExpertReportParams): Promise<GenerateResult>
  // 内部编排: 调研 → 写作 → PPT → PDF
  // 输出: { reportUrl, pptxUrl, pdfUrl }
}
```

### 3.4 Smartflow 新增节点类型

在 `mxmcgi` 的 Smartflow 节点体系中新增：

```json
{
  "nodes": [
    {
      "id": "expert1",
      "type": "expert",        // 新增节点类型
      "config": {
        "action": "research",  // research | write | slide | all
        "topic": "{{input.topic}}",
        "depth": "comprehensive",
        "dimensions": ["背景现状", "技术分析", "市场格局"]
      }
    },
    {
      "id": "pptx1",
      "type": "pptx",          // 新增节点类型
      "config": {
        "input": "{{expert1.output.report}}",
        "style": "bold_typography",
        "slides": 15
      }
    },
    {
      "id": "pdf1",
      "type": "pdf",           // 新增节点类型
      "config": {
        "input": "{{expert1.output.report}}",
        "title": "深度分析报告",
        "toc": true
      }
    }
  ]
}
```

### 3.5 数据模型扩展

**扩展 `generation_tasks` 表**:

```sql
-- 新增 task_type
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS task_type
  VARCHAR(50) DEFAULT 'other';

-- 已有枚举值扩展: image / text / video / audio / music
-- 新增: report / pptx / pdf
```

**扩展 `media_assets` 表**:

```sql
-- 扩展 type 枚举
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS file_format VARCHAR(20);

-- media_assets 已有字段复用:
-- - task_id: 关联生成任务
-- - media_urls: 文件 URL
-- - metadata: 扩展元数据（PPT页数、报告字数等）
```

**新增 `expert_reports` 表**（可选，存储调研中间结果）:

```sql
CREATE TABLE expert_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID REFERENCES generation_tasks(id),

  topic TEXT NOT NULL,
  depth VARCHAR(20),           -- quick / standard / comprehensive
  dimensions JSONB,             -- 调研维度数组
  research_data JSONB,          -- 原始调研数据
  report_content TEXT,          -- MD 格式报告

  output_pptx_url TEXT,
  output_pdf_url TEXT,

  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 四、样式系统（PPT）

复用 Hermes Agent 已有设计，作为预设样式包：

```
mxmcgi/src/styles/ppt/
├── bold-typography.ts   # 深色科技风（深海军蓝 + 青色/紫色强调）
├── geometric.ts          # 几何极简（白底 + 蓝色几何图形）
├── glassmorphism.ts     # 毛玻璃风格（渐变背景 + 半透明卡片）
└── index.ts             # 样式注册表
```

每种样式定义:

```typescript
interface PptStyle {
  name: string;
  background: { color: string; image?: string };
  title: { fontSize: number; color: string; fontFace: string };
  body: { fontSize: number; color: string; fontFace: string };
  accentColors: string[];
  cardStyle: 'solid' | 'glass' | 'bordered';
  layout: 'wide' | 'standard';
}
```

---

## 五、前端集成

### 5.1 新增页面

```
web/src/pages/
├── ExpertReport.tsx      # 调研报告生成页面
│   ├── TopicInput        # 主题输入
│   ├── DepthSelector     # 调研深度选择
│   ├── DimensionSelector # 调研维度勾选
│   ├── OutputSelector    # 输出格式选择（PDF/PPT）
│   └── TaskStatusView    # 任务进度展示
│
└── PptGenerator.tsx      # PPT单独生成（可选）
    ├── ContentInput      # 内容输入（MD或向导式）
    └── StyleSelector     # 样式选择
```

### 5.2 SmartflowDesigner 扩展

- 新增 `expert` / `pptx` / `pdf` 节点到节点面板
- 节点配置面板：显示对应参数表单

### 5.3 任务历史页面扩展

- `type` 筛选新增 `report` / `pptx` / `pdf` 选项
- 列表展示新增缩略图预览（PPT第一页 / PDF封面）

---

## 六、文件存储设计

### 6.1 MinIO 存储路径

```
minio-bucket/
├── reports/
│   ├── {user_id}/{task_id}/report.md
│   ├── {user_id}/{task_id}/report.pdf
│   └── {user_id}/{task_id}/report.pptx
├── pptx/
│   └── {user_id}/{task_id}/cover.png  ← 封面图
```

### 6.2 公开访问策略

- `media_assets` 表的 `media_urls` 字段存储公开访问URL
- 前端通过 Gateway 代理访问（无需直接暴露 MinIO）

---

## 七、关键技术决策

### 7.1 为什么用 pptxgenjs 而非外部 API

| 方案 | 优点 | 缺点 |
|------|------|------|
| **pptxgenjs（推荐）** | 零成本、无延迟、可深度定制、样式一致 | 需要处理字体/排版边界情况 |
| 外部 PPTX API | 无需自研 | 成本高、样式控制弱、延迟 |
| Python + python-pptx | 功能丰富 | 引入Python运行时、增加复杂度 |

### 7.2 为什么用 pandoc + Chrome 而非外部 PDF API

- pandoc: MD → HTML 转换成熟稳定
- Chrome 无头模式: HTML → PDF，样式与浏览器完全一致
- 服务器端只需安装 Chrome（约100MB），无 API 成本

### 7.3 ExpertEngine 与 Smartflow 的关系

- ExpertEngine 是**服务内部实现**，封装调研写作流程
- Smartflow 是**用户可视化编排**界面
- 用户可通过 Smartflow 的 `expert` 节点调用 ExpertEngine
- ExpertEngine 也可直接被 API 路由调用（旁路 Smartflow）

### 7.4 封面图生成

复用现有 DeerAPI/MiniMax Provider：
- 在 `SlideGenerator` 步骤中，按需调用图片生成
- 图片作为 PPTX 的一页（或封面背景）嵌入

---

## 八、实施计划

### Phase 1: 基础设施（1-2天）
1. `mxmcgi/src/expert/` 目录结构建立
2. `ExpertEngine` 核心流程骨架（无实际调用）
3. 新增 `/report` 路由（返回 mock 数据）
4. 数据库扩展（`task_type` 新增枚举值）

### Phase 2: PPTX 生成（2-3天）
1. `PptxProvider` 实现（pptxgenjs）
2. 样式系统：bold-typography / geometric / glassmorphism
3. 封面图生成（复用 DeerAPI/MiniMax）
4. `/api/v1/generation/pptx` 完整 API
5. TaskExecutor 支持 `pptx` 类型

### Phase 3: PDF 生成（1-2天）
1. `PdfProvider` 实现（pandoc + Chrome）
2. `/api/v1/generation/pdf` 完整 API
3. HTML 模板设计（封面 / 目录 / 正文）

### Phase 4: 调研能力集成（2-3天）
1. `ResearchAgent` 实现（接入 Tavily / 搜索引擎）
2. `ReportWriter` 实现（LLM 调用）
3. `SlideGenerator` 实现（LLM 生成幻灯片结构）
4. 完整 `ExpertEngine` 串联

### Phase 5: 前端 + Smartflow（2-3天）
1. `ExpertReport.tsx` 页面
2. SmartflowDesigner 新增节点类型
3. 任务历史页面扩展
4. PPT/PDF 预览组件

### Phase 6: 测试 + 优化（2天）
1. 端到端测试
2. 样式调优
3. 错误处理完善

**总工期: 约 10-15 个工作日**

---

## 九、风险与挑战

| 风险 | 缓解方案 |
|------|----------|
| PPTX 字体在服务器渲染不统一 | 使用 Web-safe 字体 + 嵌入字体子集 |
| Chrome 无头模式内存占用高 | 限制并发数，使用 `puppeteer-core` 轻量版 |
| 长报告（15000字）生成超时 | 拆分为多步骤，流式输出 |
| Smartflow 节点类型扩展成本 | 优先实现 API 模式，Smartflow 节点后续迭代 |
| 调研数据质量不稳定 | 提供数据源优先级配置，允许用户指定数据源 |

---

## 十、已验证可行的技术方案（来自Hermes Agent经验）

以下技术方案已在 Hermes Agent 独立工作站验证通过，可直接复用：

| 能力 | 技术方案 | 验证状态 |
|------|----------|----------|
| PPTX 生成 | `pptxgenjs` + `LAYOUT_WIDE` + `slide.addShape("rect")` 作背景 | ✅ 可用 |
| PDF 生成 | `pandoc --toc` + `Chrome --print-to-pdf` | ✅ 可用 |
| 演讲稿 | 每页 `slide.addNotes()` | ✅ 可用 |
| 封面图 | DeerAPI `gemini-3.1-flash-image-preview` + `aspectRatio: "9:16"` + prompt suffix | ✅ 可用 |
| Deep Search | Tavily API (`tvly-dev-` key) | ✅ 可用 |
| 调研维度 | arXiv / 艾瑞头豹 / 36氪 / GitHub 分层搜索 | ✅ 可用 |
