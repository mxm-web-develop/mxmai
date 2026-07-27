# Expert 调研 + PPT/PDF 写作能力集成方案（最终版）

**状态**: 设计定稿
**日期**: 2026-04-22

---

## 一、总体架构

```
现有框架（不变）
  Task v2 scope:    writing / outline / graph / audio / video
  TaskExecutor type: text / image / writing / ...
  Smartflow node:   model / recall / tools / ...

扩展方向（按用户确认）
  ┌─ writing scope  ← 接入 report 写作规范 prompt（业务层，不新增 scope）
  └─ tools 节点     ← 新增 3 种 tool type:
                        deep_search  （调研搜索）
                        pptx         （PPT生成）
                        pdf          （PDF生成）
```

**核心原则**：
- report = 写作 prompt 规范，不单独建 scope，复用 `writing` scope
- 调研/PPT/PDF = 工具类型，不新建 task type/Provider，挂在 `tools` 节点下
- 完全复用现有 Smartflow `tools` 节点机制，不引入新框架

---

## 二、writing scope：report 写作规范

### 2.1 设计思路

不新增 scope，在 `writing` scope 的模板层面区分「普通写作」和「报告写作」：

```
writing scope / default     → 短文（article / outline / 通用写作）
writing scope / report      → 长文报告（5000-15000字，结构化写作规范）
```

本质是**两套不同的 prompt 模板**，共 用同一套 Task v2 执行框架。

### 2.2 DB 模板配置

```sql
-- 已有: writing scope / default (普通写作)

-- 新增: writing scope / report (报告写作)
INSERT INTO prompt_engineering_config (scope, task_key, extra)
VALUES (
  'writing',
  'report',
  '{
    "taskTemplate": {
      "formSchema": {
        "type": "object",
        "required": ["topic"],
        "properties": {
          "topic":        { "type": "string" },
          "research_data": { "type": "object", "description": "调研阶段产出" },
          "depth":        { "type": "string", "default": "standard" }
        }
      },
      "prompt": {
        "unifiedTemplate": "【写作规范】你是一个专业的行业分析师，负责撰写结构严谨、深度分析的报告。\n\n## 主题\n{{topic}}\n\n## 调研资料\n{{research_data}}\n\n## 写作规范\n- 字数：5000-15000字\n- 语言：专业、客观、有深度\n- 结构顺序（严格按此顺序）：\n  1. 执行摘要（200-300字，高度凝练）\n  2. 背景现状（介绍行业/主题的基本情况）\n  3. 深度分析（2-3个维度展开，每个维度500-1500字）\n  4. 对比分析（对比业内主要玩家或方案）\n  5. 风险与机遇（各列3-5点）\n  6. 结论与展望（总结+未来趋势判断）\n  7. 参考来源（标注引用，数据来源需注明）\n\n- 格式要求：\n  * 使用 Markdown 语法\n  * 标题层级：# 一级 / ## 二级 / ### 三级\n  * 加粗用于强调关键概念和数据\n  * 段落之间空一行\n\n## 输出\n直接输出完整报告 Markdown，不要有前言或总结语。"
      },
      "extra": {
        "logicalModel": "writing-default",
        "generationParams": {
          "model": "gemini-3.1-flash",
          "temperature": 0.4,
          "maxTokens": 16384
        },
        "storage": {
          "scope": "writing",
          "pathTemplate": "reports/{user_id}/{task_id}/report.md"
        }
      }
    }
  }'::jsonb
);
```

### 2.3 调用方式

```
POST /api/v1/writing/generate?taskKey=report
Body: { topic, research_data, depth }
```

和普通 writing 任务完全一样的调用路径，区别只在 `taskKey=report`。

---

## 三、tools 节点：deep_search / pptx / pdf

### 3.1 设计思路

复用现有 Smartflow `tools` 节点机制，在 `tools` 节点下新增三种 tool type：

```
Smartflow tools 节点
  ├─ existing tools: ...
  └─ new tool types:
       ├─ deep_search   （调研搜索）
       ├─ pptx          （PPT生成）
       └─ pdf           （PDF生成）
```

不需要改 TaskExecutor，不需要改 Provider 架构，只需要在 tools 节点的配置里扩展 type 枚举。

### 3.2 工具类型定义

#### 3.2.1 deep_search（调研搜索）

```typescript
// mxmcgi/src/smartflow/tools/deep-search.ts

interface DeepSearchTool {
  type: 'deep_search';

  params: {
    query: string;                              // 搜索主题
    depth: 'quick' | 'standard' | 'comprehensive';
    dimensions?: string[];                      // 调研维度，默认 ["背景现状", "技术分析", "市场格局"]
    sources?: ('arxiv' | 'web' | 'industry')[]; // 数据源，默认全部
  };

  output: {
    findings: Record<string, string>;           // 各维度核心发现
    sources: { title: string; url: string; }[]; // 引用来源
    summary: string;                            // 调研摘要
  };
}
```

**实现**：调用 Tavily 搜索（已配置 key），多源并行搜索，结果 LLM 整理。

#### 3.2.2 pptx（PPT生成）

```typescript
// mxmcgi/src/smartflow/tools/pptx-gen.ts

interface PptxTool {
  type: 'pptx';

  params: {
    content: string | SlideData[];   // MD文本 或 JSON幻灯片数组
    style: 'bold_typography' | 'geometric' | 'glassmorphism';
    slides?: number;                 // 目标页数，默认10
    coverImage?: string;             // 可选：封面图URL（来自 deep_search 或 graph）
  };

  output: {
    fileUrl: string;                 // MinIO 存储的 PPTX 文件URL
    slides: number;                  // 实际生成页数
  };
}
```

**实现**：服务端 pptxgenjs 渲染，不走外部 API，Node.js 直接生成 `.pptx` Buffer，写入 MinIO。

#### 3.2.3 pdf（PDF生成）

```typescript
// mxmcgi/src/smartflow/tools/pdf-gen.ts

interface PdfTool {
  type: 'pdf';

  params: {
    content: string;          // Markdown 格式
    title?: string;           // 文档标题
    author?: string;          // 作者
    toc?: boolean;            // 是否生成目录，默认 true
    css?: string;             // 可选自定义 CSS 路径
  };

  output: {
    fileUrl: string;         // MinIO 存储的 PDF 文件URL
    pages: number;            // 页数
  };
}
```

**实现**：pandoc (MD→HTML) + Chrome headless (HTML→PDF)，Buffer 写入 MinIO。

---

## 四、Smartflow 配置示例

```json
{
  "name": "深度研究报告生成",
  "nodes": [
    { "id": "start", "type": "start", "input": [{ "name": "topic", "type": "text" }] },

    {
      "id": "research",
      "type": "tools",
      "config": {
        "tool": "deep_search",
        "query": "{{start.topic}}",
        "depth": "comprehensive",
        "dimensions": ["背景现状", "技术分析", "市场格局", "风险挑战", "趋势展望"]
      }
    },
    {
      "id": "write_report",
      "type": "model",
      "config": {
        "prompt": "基于以下调研结果，撰写报告：\n{{research.output.findings}}",
        "taskKey": "report",
        "scope": "writing",
        "params": { "topic": "{{start.topic}}" }
      }
    },
    {
      "id": "gen_cover",
      "type": "tools",
      "config": {
        "tool": "image_gen",
        "prompt": "为报告「{{start.topic}}」创作一幅专业封面图，风格简洁大气",
        "model": "deerapi",
        "aspectRatio": "16:9"
      }
    },
    {
      "id": "gen_pptx",
      "type": "tools",
      "config": {
        "tool": "pptx",
        "content": "{{write_report.output}}",
        "style": "bold_typography",
        "slides": 15,
        "coverImage": "{{gen_cover.output.imageUrl}}"
      }
    },
    {
      "id": "gen_pdf",
      "type": "tools",
      "config": {
        "tool": "pdf",
        "content": "{{write_report.output}}",
        "title": "{{start.topic}}",
        "toc": true
      }
    },
    {
      "id": "end",
      "type": "end",
      "output": {
        "report": "{{write_report.output}}",
        "pptx": "{{gen_pptx.fileUrl}}",
        "pdf": "{{gen_pdf.fileUrl}}"
      }
    }
  ]
}
```

---

## 五、实施步骤

### Phase 1: pptx / pdf 工具（最先做）

1. `mxmcgi/src/smartflow/tools/pptx-gen.ts`
   - 封装 pptxgenjs，服务端直接渲染
   - 输出 Buffer → MinIO → 返回 fileUrl
2. `mxmcgi/src/smartflow/tools/pdf-gen.ts`
   - 封装 pandoc + Chrome headless
   - 输出 Buffer → MinIO → 返回 fileUrl
3. tools 节点配置面板新增 `pptx` / `pdf` 选项

### Phase 2: deep_search 工具

1. `mxmcgi/src/smartflow/tools/deep-search.ts`
   - 封装 Tavily 搜索（已配置 key: `tvly-dev-1BtTOY...`）
   - 多源并行搜索 → LLM 整理 → 结构化输出
2. tools 节点配置面板新增 `deep_search` 选项

### Phase 3: report 写作模板

1. DB: `prompt_engineering_config` 插入 `scope=writing, taskKey=report` 模板
2. 前端 writing 路由支持 `taskKey=report` 参数
3. 前端写作页面新增「报告写作」选项卡

### Phase 4: Smartflow 串联

1. 4种新 tool type 接入 SmartflowDesigner
2. 调试完整 pipeline：deep_search → write_report → gen_cover → gen_pptx / gen_pdf
3. 前端任务历史支持展示 PPTX/PDF 预览

---

## 六、工具实现细节

### 6.1 pptxgenjs 服务端渲染（已知约束）

```
✓ pptx.layout = 'LAYOUT_WIDE'（字符串，layout 不是对象）
✓ slide.addShape('rect', {...}) 设置背景
✗ slide.background({ color: '...' }) 不可用
✗ layout: { name: 'LAYOUT_WIDE' } 不可用，必须字符串
```

### 6.2 deep_search 多源搜索

```
并行调用（Promise.all）：
  ├─ Tavily Web Search       （综合）
  ├─ Tavily Academic Search  （arXiv / Semantic Scholar）
  └─ Tavily News Search      （行业新闻）
结果 → LLM 整理为结构化 findings
```

### 6.3 PDF pandoc 命令

```bash
# 有目录
pandoc input.md -o output.html --toc --toc-depth=2 --standalone

# 无目录
pandoc input.md -o output.html --standalone

# Chrome headless PDF
google-chrome --headless --disable-gpu --no-sandbox \
  --print-to-pdf="output.pdf" "output.html"
```

---

## 七、与方案一的对比

| 维度 | 方案一（错误） | 最终方案（正确） |
|------|-------------|----------------|
| report 定位 | 新增 report scope | writing scope + report taskKey |
| 调研定位 | 新增 research scope | tools.deep_search |
| PPT定位 | 新增 Provider 类 | tools.pptx |
| PDF定位 | 新增 Provider 类 | tools.pdf |
| 改动范围 | Task v2 scope + TaskExecutor type + Provider | 仅 Smartflow tools 节点类型 |
| 侵入性 | 高（改核心框架） | 低（纯扩展） |
| 复杂度 | 需协调多个团队 | 单一 mxmcgi 改动 |
