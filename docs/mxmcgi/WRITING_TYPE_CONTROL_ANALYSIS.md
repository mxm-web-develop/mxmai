# Writing 与 Graph 类型控制机制对比分析

## 一、类型控制架构对比

### 1. Graph 类型控制（两层结构）

#### 架构设计
```
Graph 类型系统
├── 大类型（graphType）
│   ├── photograph（摄影）
│   ├── design（设计）
│   └── painting（绘画）
│
└── 小类型（type）
    ├── photograph
    │   ├── portrait（人像）
    │   ├── landscape（风景）
    │   ├── cinematic（电影画面）
    │   ├── commercial（产品商业拍摄）
    │   └── documentary（纪事）
    ├── design
    │   ├── 3d
    │   ├── manual（使用手册）
    │   ├── poster（画报）
    │   └── icon（图标）
    └── painting
        ├── illustration（插图）
        ├── comic（漫画）
        ├── conceptArt（原画）
        └── cartoon（卡通）
```

#### 类型配置结构
每个大类型都有独立的配置接口：
```typescript
interface PhotographTypeConfig {
  rules: string;                    // 通用规则
  typeOptions: Array<{value, label}>; // 小类型选项
  getRulesForType(type: string): string;      // 获取小类型的规则
  getParamsForType(type: string): string[];    // 获取小类型的参数列表
  getTypeLabel(type: string): string;          // 获取小类型的中文标签
}
```

#### 参数控制机制
- **每个小类型有独立的参数列表**：
  ```typescript
  const TYPE_PARAMS: Record<string, string[]> = {
    portrait: ['style', 'tone', 'environment', 'makeup', 'pose', 'lighting'],
    landscape: ['timeOfDay', 'weather', 'season', 'composition'],
    cinematic: ['filmStyle', 'mood', 'cameraAngle'],
    commercial: ['productType', 'background', 'props'],
    documentary: ['eventType', 'documentaryStyle'],
  };
  ```

- **每个小类型有独立的表单选项配置**：
  - 通过 `getFormOptionsForType(graphType, type, language)` 获取
  - 每个小类型都有独立的 `formOptions.ts` 文件
  - 支持多语言（zh/en）

- **每个小类型有独立的提示词规则**：
  ```typescript
  const TYPE_RULES: Record<string, string> = {
    portrait: `你是一位专业的人像摄影师...`,
    landscape: `你是一位专业的风景摄影师...`,
    // ...
  };
  ```

### 2. Writing 类型控制（单层结构）

#### 架构设计
```
Writing 类型系统
└── 写作类型（writing_type）
    ├── articles（文章）
    ├── lyrics（歌词）
    ├── outlines（大纲）
    ├── media-post（媒体帖子）
    ├── movie-scripts（电影剧本）
    ├── ad-scripts（广告脚本）
    ├── reviews（评论）
    ├── resumes（简历）
    └── voice-scripts（语音脚本）
```

#### 类型配置结构
所有类型共用同一个配置接口：
```typescript
interface WritingTypeConfig {
  rules: string;        // 写作规则
  outputformat: string; // 输出格式要求
}
```

#### 参数控制机制
- **所有类型共用相同的参数**：
  ```typescript
  interface WritingGenerateParams {
    writing_type?: WritingType;  // 类型标识
    // 所有类型共用这些参数
    motivation?: string;         // 动机
    stance?: string;             // 立场
    tone?: string;               // 语调
    length?: string;             // 长度
    key_elements?: string[];     // 关键要素
    // ...
  }
  ```

- **没有针对不同写作类型的独立参数列表**
- **没有针对不同写作类型的表单选项配置**
- **只有 rules 和 outputformat 区分不同写作类型**

## 二、问题分析

### 当前 Writing 类型控制的问题

1. **参数通用化问题**
   - 所有写作类型（文章、歌词、剧本、简历等）共用相同的参数（motivation, stance, tone, length, key_elements）
   - 这些参数对某些类型可能不适用（例如：简历不需要"动机"，歌词可能不需要"立场"）

2. **缺少类型特定的参数**
   - 电影剧本可能需要：场景数、角色数、对话风格等
   - 广告脚本可能需要：目标受众、产品特点、广告时长等
   - 简历可能需要：工作年限、行业领域、技能重点等
   - 歌词可能需要：曲风、情感基调、押韵要求等

3. **缺少表单选项配置**
   - Graph 系统有 `getFormOptionsForType` 接口，可以为每个小类型返回表单选项
   - Writing 系统没有类似的机制，前端无法根据写作类型动态生成表单

4. **配置不完整**
   - 很多写作类型的配置是空的（如 `lyricsConfig`, `movieScriptsConfig`）
   - 只有 `articlesConfig` 有完整的 rules 和 outputformat

## 三、写作模块完整流程

### 1. 大纲生成流程（/api/v1/writing/outline）

```
用户请求
  ↓
路由层（routes/writing.ts）
  ├── 验证 userId
  ├── 验证必需参数（uid, prompt）
  ├── 敏感词检查
  └── 决定输出模式（stream/json）
      ↓
  [流式模式]
      ↓
  writing-service.ts::generateOutlineStream()
  ├── 获取写作类型配置（getWritingTypeRules）
  ├── 构建 prompt（整合 rules）
  ├── 知识库增强（如果有）
  └── 调用 LLM 生成大纲（流式输出）
      ↓
  返回流式数据
      ↓
  [异步任务模式]
      ↓
  task-executor::createTask()
  ├── 创建任务（type: 'writing'）
  └── 执行任务
      ↓
  writing-task.ts::startWritingTask()
  ├── 更新任务状态
  ├── 调用 writing-service::generateOutline()
  └── 保存结果
```

### 2. 文章生成流程（/api/v1/writing/generate）

```
用户请求
  ↓
路由层（routes/writing.ts）
  ├── 验证 userId
  ├── 验证必需参数（prompt）
  ├── 敏感词检查
  └── 决定输出模式
      ↓
  [流式模式]
      ↓
  writing-service.ts::generateWritingStream()
  ├── 获取写作类型配置
  │   ├── getWritingTypeRules(writing_type)
  │   └── getWritingTypeOutputFormat(writing_type)
  │
  ├── 判断是否有大纲
  │   ├── [无大纲] 单次生成模式
  │   │   ├── 知识库增强
  │   │   ├── 整合写作类型 rules
  │   │   ├── 添加全局写作参数（motivation, stance, tone等）
  │   │   └── 调用 LLM 生成全文
  │   │
  │   └── [有大纲] 分段生成模式
  │       ├── 展开大纲（expandOutline）
  │       ├── 选择生成模式
  │       │   ├── parallel（并行模式）
  │       │   │   ├── 生成公用总结
  │       │   │   └── 并行生成各段落
  │       │   │
  │       │   └── sequential（顺序模式）
  │       │       └── 递归生成，每段基于前文
  │       │
  │       └── 为每个段落
  │           ├── 获取段落写作参数（从大纲节点）
  │           ├── 知识库增强（段落级别或全局）
  │           ├── 整合写作类型 rules 和 outputformat
  │           └── 调用 LLM 生成段落
  │
  └── 流式输出结果
      ↓
  [异步任务模式]
      ↓
  task-executor::createTask()
  └── writing-task.ts::startWritingTask()
      └── 调用 generateWriting()（同步版本）
```

### 3. 改写流程（/api/v1/writing/rewriting）

```
用户请求
  ↓
路由层
  ├── 验证参数
  └── 决定输出模式
      ↓
  writing-service.ts::rewriteWritingStream()
  ├── 获取写作类型配置
  ├── 构建改写 prompt
  ├── 知识库增强（可选）
  └── 调用 LLM 改写
```

### 4. 润色流程（/api/v1/writing/polishing）

```
用户请求
  ↓
路由层
  ├── 验证参数
  └── 决定输出模式
      ↓
  writing-service.ts::polishWritingStream()
  ├── 获取写作类型配置
  ├── 构建润色 prompt
  │   ├── 整合写作类型 rules
  │   └── 添加写作参数（motivation, stance, tone等）
  ├── 知识库增强（可选）
  └── 调用 LLM 润色
```

## 四、类型配置使用位置

### Graph 类型配置使用

1. **提示词生成**（graph-service.ts）
   ```typescript
   const rules = getGraphRulesForType(graphType, type);
   // 使用规则生成提示词
   ```

2. **参数提取**（graph-service.ts）
   ```typescript
   const requiredParams = getGraphParamsForType(graphType, type);
   // 根据参数列表提取业务参数
   ```

3. **表单选项**（routes/graph.ts）
   ```typescript
   const formOptions = getFormOptionsForType(graphType, type, language);
   // 返回给前端，用于动态生成表单
   ```

### Writing 类型配置使用

1. **提示词构建**（writing-service.ts）
   ```typescript
   const typeRules = getWritingTypeRules(writing_type);
   const typeOutputFormat = getWritingTypeOutputFormat(writing_type);
   // 整合到 prompt 中
   ```

2. **没有参数提取机制**
   - 所有类型共用相同的参数结构
   - 没有 `getWritingParamsForType` 这样的函数

3. **没有表单选项机制**
   - 没有 `getWritingFormOptionsForType` 这样的函数
   - 前端无法根据写作类型动态生成表单

## 五、改进建议

### 1. 引入两层类型结构（可选）

如果写作类型需要更细粒度的控制，可以考虑引入子类型：
```typescript
// 例如：articles 可以细分为
articles
  ├── blog-post（博客文章）
  ├── news-article（新闻文章）
  ├── academic-paper（学术论文）
  └── technical-doc（技术文档）
```

### 2. 为每个写作类型定义独立参数

```typescript
interface WritingTypeConfig {
  rules: string;
  outputformat: string;
  // 新增
  getParamsForType(): string[];  // 返回该类型需要的参数列表
  getFormOptions(language: 'zh' | 'en'): FormOptionsConfig;  // 返回表单选项
}

// 示例
const articlesConfig: WritingTypeConfig = {
  rules: `...`,
  outputformat: `...`,
  getParamsForType: () => ['motivation', 'stance', 'tone', 'length', 'key_elements'],
  getFormOptions: (lang) => ({ /* 文章类型的表单选项 */ }),
};

const movieScriptsConfig: WritingTypeConfig = {
  rules: `...`,
  outputformat: `...`,
  getParamsForType: () => ['sceneCount', 'characterCount', 'dialogueStyle', 'genre'],
  getFormOptions: (lang) => ({ /* 剧本类型的表单选项 */ }),
};
```

### 3. 扩展参数接口

```typescript
interface WritingGenerateParams {
  writing_type?: WritingType;
  // 通用参数（可选）
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];
  
  // 类型特定参数（使用 Record 支持扩展）
  typeSpecificParams?: Record<string, any>;
  // 例如：
  // - movie-scripts: { sceneCount: 10, characterCount: 5, ... }
  // - resumes: { workYears: 5, industry: 'tech', ... }
  // - lyrics: { musicStyle: 'pop', rhyme: true, ... }
}
```

### 4. 添加表单选项接口

```typescript
// 新增接口
export function getWritingFormOptionsForType(
  writingType: WritingType,
  language: 'zh' | 'en' = 'zh'
): FormOptionsConfig | null {
  const config = getWritingTypeConfig(writingType);
  if (config && typeof config.getFormOptions === 'function') {
    return config.getFormOptions(language);
  }
  return null;
}

// 在路由中暴露
router.get('/getformOptions', (req, res) => {
  const { writing_type, lang } = req.query;
  const formOptions = getWritingFormOptionsForType(
    writing_type as WritingType,
    (lang as 'zh' | 'en') || 'zh'
  );
  // ...
});
```

## 六、参数拼接机制对比

### Graph 的参数拼接机制（动态提取）

Graph 系统根据不同的业务类型**动态提取和拼接参数**：

```typescript
// 1. 根据 graphType 和 type 获取该类型需要的参数列表
const paramList = getGraphParamsForType(graphType, type);
// 例如：portrait -> ['style', 'tone', 'environment', 'makeup', 'pose', 'lighting']
// 例如：landscape -> ['timeOfDay', 'weather', 'season', 'composition']

// 2. 提取业务参数（只提取该类型需要的参数）
function extractBusinessParams(params, graphType, type) {
  const businessParams = {};
  const paramList = getGraphParamsForType(graphType, type);
  
  for (const paramName of paramList) {
    if (params[paramName] !== undefined && params[paramName] !== null && params[paramName] !== '') {
      businessParams[paramName] = params[paramName];
    }
  }
  
  return businessParams;
}

// 3. 拼接成字符串
const businessParamsDesc = Object.entries(businessParams)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n');

// 4. 拼接到 prompt 中
if (businessParamsDesc) {
  prompt += `\n\n【用户选择的业务参数】\n${businessParamsDesc}\n`;
}
```

**特点：**
- ✅ 根据类型动态获取参数列表
- ✅ 只提取该类型需要的参数
- ✅ 每个小类型有独立的参数定义
- ✅ 参数拼接逻辑统一，易于维护

### Writing 的参数拼接机制（硬编码）

Writing 系统**硬编码所有参数**，所有类型共用相同参数：

```typescript
// 硬编码的参数列表（所有类型共用）
const writingGuidance: string[] = [];
if (params.motivation) writingGuidance.push(`动机: ${params.motivation}`);
if (params.stance) writingGuidance.push(`立场: ${params.stance}`);
if (params.tone) writingGuidance.push(`语调: ${params.tone}`);
if (params.length) writingGuidance.push(`长度: ${params.length}`);
if (params.key_elements && params.key_elements.length > 0) {
  writingGuidance.push(`关键要素: ${params.key_elements.join('、')}`);
}

// 拼接到 prompt 中
if (writingGuidance.length > 0) {
  generatePrompt = `${generatePrompt}

【写作指导】：
${writingGuidance.join('\n')}`;
}
```

**特点：**
- ❌ 硬编码参数列表，无法根据类型动态调整
- ❌ 所有类型共用相同参数（motivation, stance, tone, length, key_elements）
- ❌ 某些参数对某些类型可能不适用（例如：简历不需要"动机"）
- ❌ 无法为不同写作类型定义不同的参数

### 对比总结

| 特性 | Graph | Writing |
|------|-------|---------|
| 参数获取方式 | 动态获取（`getGraphParamsForType`） | 硬编码 |
| 参数列表 | 每个小类型独立定义 | 所有类型共用 |
| 参数提取 | 根据类型只提取需要的参数 | 检查所有参数（无论类型） |
| 参数拼接 | 统一的拼接逻辑 | 硬编码的拼接逻辑 |
| 扩展性 | 易于添加新类型的参数 | 需要修改代码才能添加新参数 |

## 七、总结

### Graph 类型控制特点
- ✅ 两层类型结构（大类型 + 小类型）
- ✅ 每个小类型有独立的参数列表
- ✅ 每个小类型有独立的表单选项配置
- ✅ 每个小类型有独立的提示词规则
- ✅ **根据业务类型动态提取和拼接参数**
- ✅ 完整的类型配置系统

### Writing 类型控制特点
- ✅ 单层类型结构（简单清晰）
- ❌ 所有类型共用相同参数（不够灵活）
- ❌ **硬编码参数拼接，无法根据类型动态调整**
- ❌ 没有类型特定的表单选项配置
- ✅ 有基本的 rules 和 outputformat 配置
- ⚠️ 大部分类型的配置为空

### 建议
1. **短期**：完善各写作类型的 rules 和 outputformat 配置
2. **中期**：为每个写作类型定义独立的参数列表，实现类似 Graph 的动态参数提取机制
3. **长期**：如果需要更细粒度控制，考虑引入子类型结构
