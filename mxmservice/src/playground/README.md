# mxmcgi Playground 演示

这个目录包含了图生图业务相关的技术演示，帮助理解核心技术的使用方式。

## 演示文件

### 1. `01-langchain-basic.ts` - LangChain 基础演示

演示 LangChain 的基础功能：

- ✅ 初始化 LLM（OpenAI、Anthropic）
- ✅ 基础提示词调用
- ✅ 提示词模板（Prompt Template）
- ✅ 链式调用（Chain）
- ✅ 多步骤链式调用
- ✅ 流式输出

**运行方式：**
```bash
cd mxmcgi
tsx src/playground/01-langchain-basic.ts
```

**环境变量：**
```bash
OPENAI_API_KEY=sk-...
# 可选
ANTHROPIC_API_KEY=sk-ant-...
```

---

### 2. `02-langraph-workflow.ts` - LangGraph 工作流演示

演示 LangGraph 工作流编排：

- ✅ 创建状态图（StateGraph）
- ✅ 定义节点（Nodes）
- ✅ 定义边（Edges）
- ✅ 条件路由（Conditional Edges）
- ✅ 完整的图生图工作流示例

**运行方式：**
```bash
cd mxmcgi
tsx src/playground/02-langraph-workflow.ts
```

**工作流节点：**
1. 分析用户意图
2. RAG 召回相似案例
3. 优化提示词
4. 选择 LoRA 模型
5. 创建生成任务
6. 等待任务完成

---

### 3. `03-vector-database.ts` - 向量数据库流程演示

演示向量数据库的完整流程：

- ✅ 生成 Embedding（向量化）
- ✅ 存储向量到数据库
- ✅ 向量相似度搜索（余弦相似度）
- ✅ 混合搜索（向量 + 元数据过滤）
- ✅ RAG 召回完整流程

**运行方式：**
```bash
cd mxmcgi
tsx src/playground/03-vector-database.ts
```

**演示内容：**
1. 生成和存储向量
2. 向量相似度搜索
3. 混合搜索（带过滤条件）
4. RAG 召回完整流程

---

## 环境变量配置

在 `mxmcgi` 目录下创建 `.env` 文件：

```bash
# DeerAPI 配置（必需）
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=your-deerapi-key

# Supabase 配置（用于实际向量数据库，演示中使用模拟数据库）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

**注意**：演示代码使用 DeerAPI 来调用大模型，而不是直接使用 OpenAI API。DeerAPI 提供了统一的接口来访问各种大模型。

## 依赖安装

确保已安装所需依赖：

```bash
cd mxmcgi
pnpm install
```

主要依赖：
- `@langchain/openai` - OpenAI LLM 和 Embedding
- `@langchain/anthropic` - Anthropic LLM
- `@langchain/langgraph` - LangGraph 工作流
- `@langchain/core` - LangChain 核心功能

## 运行所有演示

```bash
# 运行所有演示
tsx src/playground/01-langchain-basic.ts
tsx src/playground/02-langraph-workflow.ts
tsx src/playground/03-vector-database.ts
```

## 注意事项

1. **演示使用模拟数据**：`03-vector-database.ts` 使用内存模拟数据库，实际应该连接 Supabase pgvector
2. **API 成本**：运行演示会调用 DeerAPI，产生费用
3. **环境变量**：确保设置了正确的 DeerAPI 配置（`DEERAPI_BASE_URL` 和 `DEERAPI_API_KEY`）
4. **DeerAPI 兼容性**：演示代码使用 DeerAPI 作为统一的 LLM 接口，支持 OpenAI 兼容的 API

## 下一步

完成演示后，可以：

1. **集成到实际服务**：
   - 将 LangChain 代码集成到 `mxmcgi/src/services/PromptOptimizer.ts`
   - 将 LangGraph 工作流集成到 `mxmagent/src/workflows/ImageToImageWorkflow.ts`
   - 将向量数据库代码集成到 `mxmcgi/src/services/RAGService.ts`

2. **连接真实数据库**：
   - 在 `mxmdata` 中实现 `IVectorRepository` 接口
   - 使用 Supabase pgvector 适配器
   - 替换模拟数据库

3. **扩展功能**：
   - 添加更多工作流节点
   - 实现 LoRA 模型选择逻辑
   - 添加错误处理和重试机制

## 参考文档

- [LangChain 文档](https://js.langchain.com/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [pgvector 文档](https://github.com/pgvector/pgvector)

