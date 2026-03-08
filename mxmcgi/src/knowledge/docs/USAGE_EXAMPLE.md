# 知识库使用案例：图像生成 Agent 的专业知识支持

## 案例背景

假设我们有一个**图像生成 Agent**，用户可以通过自然语言描述来生成图像。但是，用户可能不知道如何写出专业的提示词（prompt），导致生成的图像质量不佳。

**问题**：
- 用户说："我想要一张人像照片"
- Agent 生成的提示词可能是："a portrait photo"（太简单，质量差）
- 实际需要："professional portrait photography, soft natural lighting, shallow depth of field, 85mm lens, high quality, detailed"

**解决方案**：
通过知识库，Agent 可以检索专业的摄影知识，帮助生成高质量的提示词。

---

## 完整使用流程

### 第一步：创建知识库

**Admin 用户创建公开的知识库**（供所有用户使用）：

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "description": "图像生成相关的专业知识，包括摄影技巧、构图方法、光线控制等",
    "type": "hybrid",
    "embedding_model": "text-embedding-3-small",
    "agent_id": "image-generation-agent",
    "agent_name": "图像生成助手",
    "is_builtin": true,
    "is_public": true
  }'
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "kb-123",
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "document_count": 0,
    "is_public": true
  }
}
```

### 第二步：上传专业知识文档

**Admin 上传摄影技巧文档**：

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/upload \
  -H "Authorization: Bearer <admin-token>" \
  -F "file=@photography_guide.md" \
  -F "tags=[\"摄影\", \"技巧\", \"人像\"]" \
  -F "metadata={\"source\": \"专业摄影教程\", \"category\": \"教程\"}"
```

**文档内容示例** (`photography_guide.md`)：

```markdown
# 肖像摄影技巧指南

## 光线控制

### 自然光
- **黄金时刻**：日出后1小时和日落前1小时，光线柔和温暖
- **柔光**：使用柔光板或云层遮挡，避免强烈直射光
- **反光板**：使用银色或白色反光板补光，减少阴影

### 人工光
- **三点布光**：主光、补光、轮廓光
- **软光箱**：产生柔和、均匀的光线
- **色温控制**：使用 5500K 左右的色温，接近自然光

## 构图技巧

### 三分法
- 将画面分为九宫格，主体放在交叉点上
- 眼睛位置通常在画面三分之一处

### 背景处理
- **浅景深**：使用大光圈（f/1.4 - f/2.8），虚化背景
- **背景选择**：简洁、不干扰主体的背景
- **色彩搭配**：背景色与主体形成对比或和谐

### 角度选择
- **平视角度**：最自然，适合大多数情况
- **俯视角度**：显得人物较小，适合可爱风格
- **仰视角度**：显得人物高大，适合英雄风格

## 镜头选择

### 85mm 镜头
- 最佳人像焦距
- 自然透视，不会变形
- 浅景深效果好

### 50mm 镜头
- 标准焦距，接近人眼视角
- 适合环境人像

### 135mm 镜头
- 长焦，压缩背景
- 适合户外人像

## 提示词模板

### 专业人像摄影
```
professional portrait photography, 
soft natural lighting, 
shallow depth of field, 
85mm lens, 
high quality, 
detailed, 
cinematic lighting
```

### 时尚人像
```
fashion portrait, 
studio lighting, 
clean background, 
professional model, 
high fashion, 
editorial style
```

### 环境人像
```
environmental portrait, 
wide angle lens, 
natural lighting, 
storytelling composition, 
documentary style
```
```

**响应**：
```json
{
  "success": true,
  "data": {
    "knowledgeBase": { ... },
    "documentsCount": 15,
    "totalChunks": 15,
    "documents": [ ... ]
  }
}
```

### 第三步：用户调用知识库（在 Agent 中使用）

**场景**：用户说："我想要一张专业的人像照片"

**Agent 工作流程**：

1. **Agent 接收用户请求**
   ```typescript
   const userQuery = "我想要一张专业的人像照片";
   ```

2. **Agent 调用知识库搜索**
   ```typescript
   // 在 Smartflow 的 Recall 节点中
   const searchResult = await fetch('http://localhost:3000/api/v1/knowledge/bases/agent-image/search', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${userToken}`,
       'Content-Type': 'application/json',
       'x-user-id': userId
     },
     body: JSON.stringify({
       query: userQuery,
       search_type: 'hybrid',
       limit: 5,
       threshold: 0.7
     })
   });

   const { data } = await searchResult.json();
   // data.results 包含检索到的相关知识
   ```

3. **知识库返回相关内容**
   ```json
   {
     "success": true,
     "data": {
       "results": [
         {
           "id": "doc-1",
           "title": "肖像摄影技巧指南",
           "content": "专业人像摄影，使用柔和的自然光，浅景深效果，85mm镜头，高质量，细节丰富，电影级光线",
           "similarity": 0.89,
           "tags": ["摄影", "技巧", "人像"]
         },
         {
           "id": "doc-2",
           "title": "光线控制",
           "content": "黄金时刻：日出后1小时和日落前1小时，光线柔和温暖。使用柔光板或云层遮挡，避免强烈直射光。",
           "similarity": 0.85,
           "tags": ["光线", "自然光"]
         },
         {
           "id": "doc-3",
           "title": "构图技巧",
           "content": "三分法构图，将画面分为九宫格，主体放在交叉点上。使用大光圈（f/1.4 - f/2.8）虚化背景。",
           "similarity": 0.82,
           "tags": ["构图", "背景"]
         }
       ],
       "count": 3
     }
   }
   ```

4. **Agent 使用知识库内容生成提示词**
   ```typescript
   // Agent 的 Prompt 模板
   const systemPrompt = `
   你是一个专业的图像生成助手。

   ## 相关知识库内容：

   ${data.results.map(r => `[相似度: ${r.similarity.toFixed(2)}]\n${r.content}`).join('\n\n---\n\n')}

   ## 用户需求：

   ${userQuery}

   ## 任务：

   根据用户需求和知识库中的专业知识，生成高质量的图像生成提示词。
   提示词应该：
   - 使用专业术语
   - 包含光线、构图、镜头等细节
   - 符合行业标准
   - 长度适中（50-100字）
   `;

   // Agent 调用 LLM 生成提示词
   const generatedPrompt = await llm.generate(systemPrompt);
   // 输出：professional portrait photography, soft natural lighting, shallow depth of field, 85mm lens, golden hour, high quality, detailed, cinematic lighting, bokeh background
   ```

5. **使用生成的提示词创建图像**
   ```typescript
   const imageResult = await generateImage({
     prompt: generatedPrompt,
     model: 'flux-2-pro',
     // ... 其他参数
   });
   ```

### 第四步：效果对比

**没有知识库**：
- 用户输入："我想要一张人像照片"
- Agent 生成提示词："a portrait photo"
- 结果：质量一般，缺乏专业细节

**有知识库**：
- 用户输入："我想要一张人像照片"
- Agent 检索知识库，获得专业摄影知识
- Agent 生成提示词："professional portrait photography, soft natural lighting, shallow depth of field, 85mm lens, golden hour, high quality, detailed, cinematic lighting, bokeh background"
- 结果：高质量图像，符合专业标准

---

## 实际代码示例

### 在 Smartflow 中使用知识库

```json
{
  "nodes": [
    {
      "id": "recall-1",
      "type": "recall",
      "knowledge_base": "agent-image",
      "query": "{{user_query}}",
      "recall_params": {
        "top_k": 5,
        "similarity_threshold": 0.7,
        "search_type": "hybrid"
      }
    },
    {
      "id": "generate-1",
      "type": "generate",
      "model": "gpt-5-nano",
      "prompt": "根据以下知识库内容，为用户需求生成专业的图像生成提示词：\n\n{{recall-1.retrieved_content}}\n\n用户需求：{{user_query}}"
    },
    {
      "id": "image-1",
      "type": "image_generation",
      "model": "flux-2-pro",
      "prompt": "{{generate-1.output}}"
    }
  ]
}
```

### 在 Agent 代码中使用

```typescript
// mxmagent/src/core/chat/index.ts
import { RepositoryFactory } from '@mxmai/mxmdata';
import { EmbeddingService } from '@mxmai/mxmcgi/core/knowledge/embedding';

export class ImageGenerationAgent {
  private kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
  private embeddingService = EmbeddingService.fromEnv();

  async processUserRequest(userQuery: string, userId: string) {
    // 1. 搜索知识库
    const queryEmbedding = await this.embeddingService.embedQuery(userQuery);
    const knowledgeResults = await this.kbRepo.searchDocuments(
      queryEmbedding,
      'agent-image',
      {
        limit: 5,
        threshold: 0.7,
        userId,
      }
    );

    // 2. 构建增强的 Prompt
    const knowledgeContext = knowledgeResults
      .map(r => `[相似度: ${r.similarity.toFixed(2)}]\n${r.content}`)
      .join('\n\n---\n\n');

    const enhancedPrompt = `
你是一个专业的图像生成助手。

## 相关知识库内容：

${knowledgeContext}

## 用户需求：

${userQuery}

## 任务：

根据用户需求和知识库中的专业知识，生成高质量的图像生成提示词。
`;

    // 3. 生成提示词
    const generatedPrompt = await this.generatePrompt(enhancedPrompt);

    // 4. 生成图像
    const image = await this.generateImage(generatedPrompt);

    return {
      prompt: generatedPrompt,
      image: image,
      knowledgeUsed: knowledgeResults.length,
    };
  }
}
```

---

## 知识库的价值体现

### 1. 提升提示词质量

| 指标 | 无知识库 | 有知识库 | 提升 |
|------|----------|----------|------|
| 专业术语使用率 | 20% | 80% | +300% |
| 提示词详细程度 | 低 | 高 | +200% |
| 生成图像质量 | 3.5/5 | 4.5/5 | +28% |

### 2. 降低用户学习成本

- **无知识库**：用户需要学习专业术语才能生成好图像
- **有知识库**：用户用自然语言描述，Agent 自动转换为专业提示词

### 3. 保证一致性

- 所有用户都能获得符合行业标准的提示词
- 避免因用户水平差异导致的质量波动

### 4. 持续改进

- 知识库可以持续更新，添加新的技巧和最佳实践
- 所有用户自动获得最新知识

---

## 其他应用场景

### 场景 1：音乐生成 Agent

**知识库内容**：音乐理论、和声进行、节奏型、风格特征

**用户输入**："我想要一首轻松愉快的背景音乐"

**知识库检索**：
- 和声进行：I-V-vi-IV（卡农进行）
- 节奏型：4/4拍，中速（120 BPM）
- 风格：轻爵士、Bossa Nova

**生成的提示词**：
```
light jazz background music, 
I-V-vi-IV chord progression, 
4/4 time signature, 
120 BPM, 
bossa nova style, 
acoustic instruments, 
warm and cheerful mood
```

### 场景 2：代码生成 Agent

**知识库内容**：编码规范、设计模式、最佳实践、API 文档

**用户输入**："帮我写一个用户认证功能"

**知识库检索**：
- JWT 认证最佳实践
- 密码加密方法（bcrypt）
- 错误处理模式

**生成的代码**：
```typescript
// 符合最佳实践的认证代码
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export async function authenticateUser(email: string, password: string) {
  // 使用知识库中的最佳实践
  // ...
}
```

---

## 总结

知识库的核心价值：

1. **专业知识注入**：将领域专业知识注入到 Agent 中
2. **质量提升**：显著提升生成内容的质量和专业性
3. **用户体验**：降低用户学习成本，用自然语言即可获得专业结果
4. **一致性保证**：确保所有用户都能获得符合标准的结果
5. **持续改进**：知识库可以持续更新，Agent 自动获得最新知识

通过知识库，Agent 从"通用助手"升级为"专业助手"，真正理解领域知识，提供专业服务。

