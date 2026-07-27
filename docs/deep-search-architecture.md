# 多维度深度搜索架构设计方案

## 1. 背景与目标

为大纲生成（Outline）和 Smartflow 工作流提供强大的网络搜索能力，支持多维度、深度检索。

### 核心需求
- **多维度搜索**：新闻、学术、论坛、社交、官方等不同来源
- **深度检索**：支持快速/标准/深度三种搜索模式
- **多源聚合**：多个搜索源结果去重、排序、评分
- **与大模型集成**：作为 Agent/Smartflow 的工具能力

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Search Service                        │
│                  (对外统一 API 接口)                        │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Search Aggregator                        │
│           (多源聚合、去重、排序、评分)                      │
└──────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │
   ┌───▼──┐  ┌──▼──┐  ┌──▼──┐  ┌──▼──────┐
   │Brave │  │Tavily│ │Serp │  │DuckDuckGo│
   │Search│  │ AI  │  │ API │  │ (兜底)   │
   └──────┘  └─────┘  └─────┘  └──────────┘
```

## 3. 目录结构（修订）

```
mxmcgi/src/core/
└── search/
    ├── providers/
    │   ├── base.ts              # Provider 基类/接口
    │   ├── brave.ts            # Brave Search API
    │   ├── tavily.ts           # Tavily AI API
    │   ├── serpapi.ts          # SerpAPI (Google 搜索)
    │   └── duckduckgo.ts       # DuckDuckGo (免费兜底)
    ├── types.ts                 # 统一类型定义
    ├── aggregator.ts            # 多源聚合逻辑
    └── search-service.ts        # 对外 Service 接口
```

## 4. 类型定义

```typescript
// search/types.ts

/** 搜索维度 */
export type SearchDimension =
  | 'general'    // 通用搜索
  | 'news'       // 新闻资讯
  | 'academic'    // 学术论文
  | 'forum'      // 论坛社区
  | 'social'     // 社交媒体
  | 'video'      // 视频平台
  | 'official'   // 官方网站
  | 'all';       // 全维度

/** 搜索深度 */
export type SearchDepth = 'quick' | 'standard' | 'deep';

/** 单条搜索结果 */
export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedAt?: string;
  dimension?: SearchDimension;
  score?: number;           // 置信度评分
  source: string;           // 来源 provider
}

/** 单维度搜索结果 */
export interface DimensionSearchResult {
  dimension: SearchDimension;
  provider: string;
  items: SearchResultItem[];
  total: number;
  query: string;
  timestamp: string;
}

/** 多维度聚合搜索请求 */
export interface DeepSearchRequest {
  query: string;
  dimensions?: SearchDimension[];
  depth?: SearchDepth;
  numResults?: number;        // 每个维度返回数量
  timeRange?: 'day' | 'week' | 'month' | 'year';
  language?: 'zh' | 'en' | 'all';
}

/** 多维度聚合搜索响应 */
export interface MultiDimensionSearchResult {
  dimensionResults: Record<SearchDimension, DimensionSearchResult>;
  aggregated: SearchResultItem[];  // 去重合并后的结果
  query: string;
  depth: SearchDepth;
  timestamp: string;
}
```

## 5. Provider 设计

### 5.1 统一接口

```typescript
// providers/base.ts

export interface SearchProvider {
  /** Provider 名称 */
  name: string;

  /** 支持的搜索维度 */
  supportedDimensions: SearchDimension[];

  /** 执行搜索 */
  search(request: ProviderSearchRequest): Promise<DimensionSearchResult>;

  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

export interface ProviderSearchRequest {
  query: string;
  dimension: SearchDimension;
  numResults: number;
  timeRange?: string;
  language?: string;
}
```

### 5.2 Provider 选择策略

| 维度 | 推荐 Provider | 原因 |
|------|-------------|------|
| `general` | Tavily + Brave | 结构化 + 实时 |
| `news` | Brave | 实时性好 |
| `academic` | Tavily Academic | 专为 AI 优化 |
| `forum` | Tavily | 覆盖 Reddit 等 |
| `social` | Brave | Twitter/X 索引 |
| `video` | SerpAPI (YouTube) | YouTube 搜索 |
| `official` | SerpAPI (Google) | Google 结果权威 |

### 5.3 各 Provider 实现要点

#### Brave Search
- 免费额度：2500次/天
- 支持 News API
- 实时性好

#### Tavily AI
- 专为 AI 设计，返回结构化 JSON
- 支持 academic search
- 支持 multi-search（多查询并行）
- 免费额度：1000次/天

#### SerpAPI
- Google/Bing 搜索结果
- 需要 API Key（付费）
- 适合需要 Google 权威性的场景

#### ArXiv Academic（新增）
- 免费额度：无限制（官方公开 API）
- 无需 API Key
- 学术论文质量高，适合科研、技术调研
- 支持按类别、日期排序

#### 中文市场数据源（新增）
```typescript
// providers/chinese-market.ts

export const CHINESE_MARKET_SOURCES = [
  'iresearch.cn',        // 艾瑞咨询
  'hlzq.com',            // 头豹研究院
  '36kr.com',            // 36氪研究院
  'cbgc.com.cn',         // 中国产业研究
  'chinairr.org',        // 中国产业调研网
];

export const CHINESE_FINANCE_SOURCES = [
  'eastmoney.com',       // 东方财富
  '10jqka.com.cn',       // 同花顺
  'xueqiu.com',          // 雪球
  'stock.stcn.com',       // 证券时报
];

export const CHINESE_INDUSTRY_SOURCES = [
  'mps.gov.cn',          // 公安部
  'miit.gov.cn',         // 工信部
  'circ.gov.cn',         // 银保监会
  'ccps.org.cn',         // 中国汽车工业协会
];
```

中文数据源 Provider 特点：
- 需要爬虫或第三方中文搜索 API（如百度搜索 API）
- 或者通过 Tavily 的 `search_depth` 和 `include_domains` 参数限定中文源
- 支持按行业分类（金融、医疗、教育、汽车等）

## 6. 聚合器设计（增强）

### 6.1 聚合流程

```
1. 并行调用多个 Provider
2. 按 (domain + title) hash 去重
3. 计算综合评分
4. 按评分排序返回
```

### 6.2 评分算法

```typescript
function calculateScore(item: SearchResultItem): number {
  // 基础分：来源质量
  let score = PROVIDER_BASE_SCORE[item.source] || 50;

  // 权威性加分：官方域名
  if (isOfficialDomain(item.domain)) score += 20;

  // 相关性：标题匹配度（模糊匹配）
  score += calculateRelevance(item.title, query) * 30;

  // 新鲜度：近期内容加分
  if (item.publishedAt) {
    const age = daysSince(item.publishedAt);
    score -= age * 0.5;  // 每天减0.5分
  }

  return Math.max(0, Math.min(100, score));
}
```

### 6.3 去重策略

```typescript
function deduplicate(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    // 使用 normalized(domain + title) 作为 key
    const key = normalize(`${item.domain}|${item.title}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '').slice(0, 100);
}
```

### 6.4 交叉验证评分（新增）

Expert 方法论要求同一数据点从 ≥2 个独立来源确认才算可信：

```typescript
interface SearchResultWithClaim {
  item: SearchResultItem;
  claims: string[];  // 从 snippet 中提取的关键声明
}

function calculateScoreWithCrossValidation(
  item: SearchResultItem,
  allResults: SearchResultItem[],
  claims: string[]
): number {
  // 基础分：来源质量
  let score = PROVIDER_BASE_SCORE[item.source] || 50;

  // 权威性加分：官方域名
  if (isOfficialDomain(item.domain)) score += 20;

  // 相关性：标题匹配度（模糊匹配）
  score += calculateRelevance(item.title, claims[0]) * 30;

  // 新鲜度：近期内容加分
  if (item.publishedAt) {
    const age = daysSince(item.publishedAt);
    score -= age * 0.5;
  }

  // 交叉验证加分：有独立来源佐证
  const corroboratingSources = allResults.filter(r =>
    r !== item &&
    r.domain !== item.domain &&
    claimsOverlap(r.snippet, item.snippet)
  );
  if (corroboratingSources.length >= 1) {
    score += 15;  // 有独立来源佐证
  }
  if (corroboratingSources.length >= 2) {
    score += 10;  // 有多个独立来源
  }

  // 来源类型加成
  if (isAuthoritativeSource(item.domain)) score += 10;

  return Math.max(0, Math.min(100, score));
}
```

### 6.5 搜索迭代机制（新增）

当搜索结果质量不足时，自动进行迭代扩展：

```typescript
interface SearchIteration {
  round: number;
  query: string;
  resultsCount: number;
  quality: 'insufficient' | 'adequate' | 'rich';
  action?: 'expand_keywords' | 'switch_provider' | 'extract_content';
}

interface SearchIterationConfig {
  maxRounds: number;         // 最大迭代轮数（默认3）
  qualityThreshold: number;   // 质量阈值（默认60）
  minResultsPerDimension: number;  // 每维度最小结果数（默认5）
}

async deepSearchWithIteration(
  request: DeepSearchRequest,
  config: SearchIterationConfig = { maxRounds: 3, qualityThreshold: 60, minResultsPerDimension: 5 }
): Promise<MultiDimensionSearchResult> {
  const iterations: SearchIteration[] = [];
  let currentResults = await this.deepSearch(request);

  for (let round = 1; round <= config.maxRounds; round++) {
    const quality = assessQuality(currentResults, config);

    if (quality === 'rich') {
      break;  // 质量足够，停止迭代
    }

    const action = determineIterationAction(quality, currentResults, request);
    iterations.push({ round, query: request.query, resultsCount: currentResults.aggregated.length, quality });

    switch (action) {
      case 'expand_keywords':
        // 扩展关键词：同义词、下位词
        request.query = expandQuery(request.query);
        break;
      case 'switch_provider':
        // 切换 Provider：针对当前结果少的维度
        request.dimensions = getLowQualityDimensions(currentResults);
        break;
      case 'extract_content':
        // 深度提取：对已有结果进行内容抓取
        await this.extractContent(currentResults);
        break;
    }

    currentResults = await this.deepSearch(request);
  }

  return { ...currentResults, iterations };
}
```

## 7. 内容深度提取（新增）

Expert 方法论强调：搜索结果需进一步提取内容进行分析：

```typescript
// types.ts 新增字段
interface DeepSearchRequest {
  // ...现有字段
  extractContent?: boolean;        // 是否深度提取内容
  extractDomains?: string[];        // 只对特定域名提取（如官方/权威媒体）
  extractPrompt?: string;          // 提取内容的 prompt（用于 LLM 分析）
  maxExtractCount?: number;         // 最大提取条数（默认10）
}

// 提取内容请求
interface ContentExtractRequest {
  urls: string[];
  prompt?: string;   // "提取文章的核心观点、数据、结论"
}

// 提取内容响应
interface ContentExtractResult {
  url: string;
  title: string;
  content: string;       // 原始内容
  summary?: string;     // LLM 生成的摘要
  keyPoints?: string[]; // 关键信息点
  dataPoints?: {        // 结构化数据
    label: string;
    value: string;
    source: string;
  }[];
  confidence: 'high' | 'medium' | 'low';
  extractedAt: string;
}
```

### 7.1 提取服务设计

```typescript
// search/content-extractor.ts

export class ContentExtractor {
  constructor(
    private llmClient: LLMClient,  // 用于摘要生成
    private httpClient: AxiosInstance,
    private maxConcurrent = 3    // 并发限制
  ) {}

  async extract(urls: string[], prompt?: string): Promise<ContentExtractResult[]> {
    // 1. 并发抓取（限制并发数）
    const rawContents = await this.fetchAllWithLimit(urls);

    // 2. 过滤有效内容（去掉导航、侧边栏、页脚）
    const cleaned = rawContents.map(c => this.cleanHtml(c));

    // 3. LLM 提取关键信息
    const results = await Promise.all(
      cleaned.map(async (content, i) => {
        const summary = await this.llmClient.extract({
          content,
          prompt: prompt || '提取核心观点、关键数据、研究结论',
        });
        return {
          url: urls[i],
          title: rawContents[i].title,
          content: content,
          summary: summary.keyPoints,
          keyPoints: summary.claims,
          dataPoints: summary.dataPoints,
          confidence: this.assessConfidence(rawContents[i]),
          extractedAt: new Date().toISOString(),
        };
      })
    );

    return results;
  }

  private cleanHtml(html: string): string {
    // 使用 mozilla/readability 或类似的库提取正文
    // 去掉 script、style、nav、footer 等非正文内容
  }
}
```

### 7.2 与搜索流程集成

```typescript
// search-service.ts

async deepSearch(request: DeepSearchRequest): Promise<MultiDimensionSearchResult & {
  extractedContent?: ContentExtractResult[];
}> {
  // 1. 执行多维度搜索
  const searchResult = await this.aggregator.aggregate(request);

  // 2. 如果需要内容提取
  if (request.extractContent) {
    const urlsToExtract = this.filterExtractTargets(
      searchResult.aggregated,
      request.extractDomains
    ).slice(0, request.maxExtractCount || 10);

    const extractedContent = await this.contentExtractor.extract(
      urlsToExtract,
      request.extractPrompt
    );

    return { ...searchResult, extractedContent };
  }

  return { ...searchResult, extractedContent: [] };
}
```

## 8. Search Service 接口（增强）

```typescript
// search/search-service.ts

export class SearchService {
  /**
   * 单维度搜索
   */
  async search(
    request: DeepSearchRequest,
    preferredProvider?: string
  ): Promise<DimensionSearchResult>;

  /**
   * 多维度深度搜索
   */
  async deepSearch(
    request: DeepSearchRequest
  ): Promise<MultiDimensionSearchResult>;

  /**
   * 快速搜索（单源）
   */
  async quickSearch(
    query: string,
    dimension?: SearchDimension
  ): Promise<SearchResultItem[]>;
}
```

## 9. 主题类型路由（新增）

Expert 方法论根据**主题类型**选择最优数据源，而非仅按维度选择：

```typescript
// search/topic-router.ts

type TopicType =
  | 'academic'      // 学术研究
  | 'market'        // 市场调研
  | 'investment'    // 投资分析
  | 'industry'      // 行业赛道
  | 'news'          // 新闻事件
  | 'product'       // 产品竞品
  | 'prompt'        // 提示词工程/模型使用（新增）
  | 'general';      // 通用

interface TopicConfig {
  topicType: TopicType;
  primaryProviders: string[];    // 主用 Provider
  secondaryProviders: string[];  // 备用 Provider
  defaultDimensions: SearchDimension[];
  recommendedDepth: SearchDepth;
}

const TOPIC_CONFIGS: Record<TopicType, TopicConfig> = {
  academic: {
    topicType: 'academic',
    primaryProviders: ['arxiv', 'tavily-academic'],
    secondaryProviders: ['serpapi'],
    defaultDimensions: ['academic', 'official'],
    recommendedDepth: 'deep',
  },
  market: {
    topicType: 'market',
    primaryProviders: ['tavily', 'chinese-market'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['news', 'forum', 'official'],
    recommendedDepth: 'standard',
  },
  investment: {
    topicType: 'investment',
    primaryProviders: ['tavily', 'serpapi'],
    secondaryProviders: ['chinese-finance'],
    defaultDimensions: ['news', 'official', 'forum'],
    recommendedDepth: 'deep',
  },
  industry: {
    topicType: 'industry',
    primaryProviders: ['tavily', 'chinese-market'],
    secondaryProviders: ['brave', 'serpapi'],
    defaultDimensions: ['news', 'official', 'forum', 'academic'],
    recommendedDepth: 'standard',
  },
  news: {
    topicType: 'news',
    primaryProviders: ['brave', 'tavily'],
    secondaryProviders: ['duckduckgo'],
    defaultDimensions: ['news', 'social'],
    recommendedDepth: 'quick',
  },
  product: {
    topicType: 'product',
    primaryProviders: ['brave', 'serpapi'],
    secondaryProviders: ['tavily'],
    defaultDimensions: ['forum', 'social', 'news'],
    recommendedDepth: 'standard',
  },
  general: {
    topicType: 'general',
    primaryProviders: ['tavily', 'brave'],
    secondaryProviders: ['duckduckgo'],
    defaultDimensions: ['general'],
    recommendedDepth: 'standard',
  },
  prompt: {
    topicType: 'prompt',
    primaryProviders: ['serpapi', 'tavily'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['official', 'forum', 'social'],
    recommendedDepth: 'standard',
  },
};

// 自动推断主题类型
function inferTopicType(query: string): TopicType {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.match(/\b(paper|research|arxiv|study|学术|论文|研究)\b/)) {
    return 'academic';
  }
  if (lowerQuery.match(/\b(投资|融资|估值|财报|revenue|investor|ipo)\b/)) {
    return 'investment';
  }
  if (lowerQuery.match(/\b(市场|规模|份额|增长率|market size|industry)\b/)) {
    return 'market';
  }
  if (lowerQuery.match(/\b(赛道|格局|竞品|competitor|对比)\b/)) {
    return 'industry';
  }
  if (lowerQuery.match(/\b(产品|评测|review|体验|功能)\b/)) {
    return 'product';
  }
  if (lowerQuery.match(/\b(最新|今日|新闻|news|事件)\b/)) {
    return 'news';
  }

  // Prompt 工程识别（新增）
  // 强信号：提示词/怎么写/如何用/教程/技巧
  if (lowerQuery.match(/\b(prompt|提示词|咒语|指令|instruct|怎么写|如何用|教程|技巧|优化|best practice|example|示例)\b/)) {
    return 'prompt';
  }
  // 强信号：模型名 + 使用类关键词
  if (lowerQuery.match(/\b(nano|seedance|kling|runway|sora|gemini|claude|chatgpt|midjourney|stable diffusion|dalle|sora|minimax)\b/) &&
      lowerQuery.match(/\b(怎么|如何|使用|教程|写|应用|技巧|优化|prompt|instruct|镜头|分镜|视频)\b/)) {
    return 'prompt';
  }

  return 'general';
}
```

### 9.2 Prompt 类数据源配置（新增）

Prompt 类 query 的核心需求是**官方示例和最佳实践**，数据源优先级不同于其他类型：

```typescript
// search/prompt-sources.ts

export const PROMPT_SOURCE_PRIORITY = {
  // P0: 官方文档/官方博客（权重最高）
  official: [
    'huggingface.co',              // Model Card + 官方示例
    'github.com',                  // README + 官方仓库
    'openai.com',                 // OpenAI 官方文档
    'anthropic.com',              // Claude 官方文档
    'deepmind.com',               // Google DeepMind Blog
    'ai.google',                  // Gemini 官方
    'minimax.io',                 // MiniMax 官方（如适用）
    'seedance.io',                // Seedance 官方（如适用）
  ],

  // P1: 官方示例库/Gallery
  galleries: [
    'promptparrot.com',
    'publicprompts.org',
    'chunky.promptlayer.com',
    'learningprompt.wiki',
  ],

  // P2: 社区教程
  community: [
    'reddit.com/r/PromptEngineering',
    'reddit.com/r/ChatGPT',
    'reddit.com/r/Midjourney',
    'zhihu.com',                  // 知乎
    'csdn.net',                   // CSDN
    'bilibili.com',               // B站视频教程
  ],

  // P3: 视频平台
  video: [
    'youtube.com',
  ],

  // 降权/排除
  deprioritize: [
    '广告站点',
    '低质量博客',
    '需要登录的付费内容',
  ],
};
```

### 9.3 Prompt 类搜索策略（新增）

Prompt 类与其他 TopicType 的核心区别：

| 维度 | Prompt 类 | Market 类 | Academic 类 |
|-----|---------|---------|------------|
| 核心目标 | 找示例/模板 | 找数据/报告 | 找论文 |
| 首选来源 | 官方文档/Gallery | 行业报告 | arXiv |
| 结果评分 | 官方示例优先 | 数据权威性优先 | 论文质量优先 |
| 内容提取 | 提取 prompt 模板 | 提取数据点 | 提取摘要 |
| 关键词策略 | 模型名 + 任务类型 | 行业 + 数据指标 | 学术术语 |

```typescript
// Prompt 类专用搜索策略
interface PromptSearchStrategy {
  // 提取 prompt 示例
  extractExamples: boolean;
  // 提取模板/框架
  extractTemplates: boolean;
  // 官方文档权重
  officialBoost: number;   // 默认 +30
  // 示例页权重
  exampleBoost: number;    // 默认 +20
}

const PROMPT_STRATEGY: PromptSearchStrategy = {
  extractExamples: true,
  extractTemplates: true,
  officialBoost: 30,
  exampleBoost: 20,
};
```

### 9.4 Prompt 类结果评分（新增）

```typescript
function calculatePromptScore(item: SearchResultItem, query: string): number {
  let score = PROVIDER_BASE_SCORE[item.source] || 50;
  const lowerQuery = query.toLowerCase();
  const lowerTitle = item.title.toLowerCase();
  const lowerDomain = item.domain.toLowerCase();

  // 官方域名权重加成
  if (PROMPT_SOURCE_PRIORITY.official.some(d => lowerDomain.includes(d))) {
    score += 30;
  }

  // 示例/Gallery 域名权重加成
  if (PROMPT_SOURCE_PRIORITY.galleries.some(d => lowerDomain.includes(d))) {
    score += 20;
  }

  // 标题含关键词加权
  const promptKeywords = ['prompt', '示例', 'example', '教程', 'tutorial', '怎么写', 'how to'];
  if (promptKeywords.some(k => lowerTitle.includes(k))) {
    score += 15;
  }

  // 模型名匹配
  const modelNames = ['nano', 'seedance', 'kling', 'runway', 'sora', 'gemini', 'claude'];
  if (modelNames.some(m => lowerQuery.includes(m) && lowerTitle.includes(m))) {
    score += 20;
  }

  // 新鲜度：近期内容
  if (item.publishedAt) {
    const age = daysSince(item.publishedAt);
    score -= age * 0.3;  // Prompt 类内容更新较慢，衰减更慢
  }

  return Math.max(0, Math.min(100, score));
}
```

### 9.5 示例提取逻辑（新增）

Prompt 类搜索结果需要专门提取示例内容：

```typescript
// search/prompt-extractor.ts

interface ExtractedPrompt {
  originalUrl: string;
  title: string;
  prompt: string;           // 提取的 prompt 原文
  model?: string;           // 适用模型
  useCase?: string;         // 用途描述
 效果描述?: string;         // 效果说明
  tags?: string[];          // 标签
}

async extractPrompts(
  results: SearchResultItem[],
  config: PromptSearchStrategy
): Promise<ExtractedPrompt[]> {
  // 1. 筛选高权重 URL
  const priorityUrls = results
    .filter(r => isHighPrioritySource(r.domain, PROMPT_SOURCE_PRIORITY))
    .slice(0, 10);

  // 2. 抓取内容
  const contents = await this.contentExtractor.extract(
    priorityUrls.map(r => r.url)
  );

  // 3. 提取 prompt 示例
  const extractedPrompts = await Promise.all(
    contents.map(async (c) => {
      // 使用 LLM 从页面内容中提取 prompt 示例
      const prompts = await this.llmClient.extractPrompts({
        content: c.content,
        instruction: `从内容中提取所有 prompt 示例，包括：prompt原文、适用模型、用途描述`,
      });
      return prompts;
    })
  );

  return extractedPrompts.flat();
}

### 9.6 搜索深度模式细化（新增）

Expert 对 quick/standard/deep 有具体的执行参数：

```typescript
// search/depth-config.ts

interface SearchDepthConfig {
  dimensions: SearchDimension[];           // 搜索维度数量
  keywordsPerDimension: number;              // 每维度关键词组合数
  resultsPerProvider: number;               // 每 Provider 结果数
  extractContent: boolean;                   // 是否深度提取
  crossValidate: boolean;                    // 是否交叉验证
  iterate: boolean;                         // 是否启用迭代
}

const DEPTH_CONFIGS: Record<SearchDepth, SearchDepthConfig> = {
  quick: {
    dimensions: ['general', 'news'].slice(0, 2),
    keywordsPerDimension: 1,
    resultsPerProvider: 3,
    extractContent: false,
    crossValidate: false,
    iterate: false,
  },
  standard: {
    dimensions: ['news', 'academic', 'forum', 'official', 'general'],
    keywordsPerDimension: 2,   // 原词 + 近义词
    resultsPerProvider: 5,
    extractContent: true,
    crossValidate: false,
    iterate: false,
  },
  deep: {
    dimensions: ['news', 'academic', 'forum', 'official', 'social', 'video'],
    keywordsPerDimension: 3,   // 原词 + 近义词 + 下位词
    resultsPerProvider: 8,
    extractContent: true,
    crossValidate: true,       // 多源交叉验证
    iterate: true,            // 自动迭代扩展
  },
};
```

### 9.7 Search Service 增强

```typescript
export class SearchService {
  /**
   * 自动路由搜索（根据主题类型自动选择数据源和深度）
   */
  async autoSearch(
    request: DeepSearchRequest
  ): Promise<MultiDimensionSearchResult & { topicType: TopicType }> {
    const topicType = inferTopicType(request.query);
    const config = TOPIC_CONFIGS[topicType];

    // 自动填充未指定字段
    const enrichedRequest: DeepSearchRequest = {
      ...request,
      dimensions: request.dimensions || config.defaultDimensions,
      depth: request.depth || config.recommendedDepth,
    };

    const results = await this.deepSearch(enrichedRequest);

    return { ...results, topicType };
  }

  /**
   * 单维度搜索
   */
  async search(
    request: DeepSearchRequest,
    preferredProvider?: string
  ): Promise<DimensionSearchResult>;

  /**
   * 多维度深度搜索
   */
  async deepSearch(
    request: DeepSearchRequest
  ): Promise<MultiDimensionSearchResult>;

  /**
   * 快速搜索（单源）
   */
  async quickSearch(
    query: string,
    dimension?: SearchDimension
  ): Promise<SearchResultItem[]>;

  /**
   * 带内容提取的深度搜索
   */
  async deepSearchWithExtract(
    request: DeepSearchRequest
  ): Promise<MultiDimensionSearchResult & { extractedContent: ContentExtractResult[] }>;
}
```

## 10. 与 Smartflow 集成

### 10.1 新增工具类型

在 `smartflow/core/models/types.ts` 新增：

```typescript
type ToolType =
  | 'web_search'        // 现有
  | 'deep_search'       // 新增：多维度深度搜索
  | 'multi_dimension_search';  // 新增：按维度搜索
```

### 10.2 ToolsExecutor 扩展

```typescript
case 'deep_search':
  return await this.executeDeepSearch(resolvedParams, context);
case 'multi_dimension_search':
  return await this.executeMultiDimensionSearch(resolvedParams, context);
```

### 8.3 节点配置示例

```json
{
  "type": "tools",
  "tool_type": "deep_search",
  "tool_params": {
    "query": "{{user_query}}",
    "dimensions": ["news", "academic", "forum"],
    "depth": "deep",
    "numResults": 10
  }
}
```

## 11. 与大纲/写作集成

### 11.1 大纲业务 Prompt 示例

```
【任务】
对「${topic}」进行多维度深度研究，为调研报告提供信息支撑。

【搜索维度】
${dimensions || 'news,academic,official'}

【搜索深度】
${depth || 'standard'}

【输出要求】
每个维度输出：
1. 核心发现（3-5条）
2. 关键信息点
3. 信息来源（URL列表）
4. 置信度评估（高/中/低）
5. 研究建议

【重要】
- 优先使用官方来源和权威媒体
- 信息冲突时，标注争议点
- 数据需有来源支撑
```

### 11.2 写作场景示例

```
在写作「${topic}」之前，先进行深度搜索：

1. 最新动态（新闻维度）
2. 学术研究（学术维度）
3. 专家观点（论坛维度）
4. 官方政策（官方维度）

根据搜索结果，确定文章切入角度和论点支撑。
```

## 12. API 路由设计（增强）

```
GET  /api/v1/search
     ?q=<query>
     &dimensions=<dim1,dim2>
     &depth=<quick|standard|deep>
     &num=<number>

POST /api/v1/search/deep
     Body: DeepSearchRequest

GET  /api/v1/search/providers
     # 返回支持的 provider 列表和状态

GET  /api/v1/search/health
     # 健康检查

POST /api/v1/search/extract        # 新增：内容深度提取
     Body: { urls: string[], prompt?: string }

POST /api/v1/search/analyze        # 新增：搜索结果质量分析
     Body: { query: string, results: SearchResultItem[] }

POST /api/v1/search/auto           # 新增：自动路由搜索
     Body: { query: string, depth?: SearchDepth }
```

## 13. 配置管理

### 13.1 环境变量

```bash
# Brave Search
BRAVE_API_KEY=your_brave_api_key

# Tavily
TAVILY_API_KEY=your_tavily_api_key

# SerpAPI
SERP_API_KEY=your_serp_api_key

# 默认搜索深度
DEFAULT_SEARCH_DEPTH=standard

# 每个维度默认结果数
DEFAULT_SEARCH_NUM=5
```

### 13.2 Admin 后台配置

在 Admin「业务配置」中新增搜索维度配置：

```
scope: search
type: deep-search
subtype: [news, academic, forum, ...]

extra:
  defaultDimensions: [general]
  defaultDepth: standard
  enabledProviders: [brave, tavily]
  fallbackProvider: duckduckgo
```

## 14. 实现优先级（修订）

### Phase 1: 基础能力
- [ ] 定义类型和接口
- [ ] 实现 Brave Search Provider
- [ ] 实现 Tavily Provider
- [ ] 实现 ArXiv Provider（新增）
- [ ] 实现基础聚合器
- [ ] Service 接口开发
- [ ] API 路由

### Phase 2: 完善能力
- [ ] SerpAPI Provider
- [ ] DuckDuckGo 兜底 Provider
- [ ] 中文市场数据源 Provider（新增）
- [ ] 评分算法 + 交叉验证（增强）
- [ ] 缓存机制
- [ ] 搜索迭代机制（新增）

### Phase 3: 深度集成
- [ ] 内容深度提取服务（新增）
- [ ] 主题类型路由（新增）
- [ ] Smartflow 工具节点扩展
- [ ] 大纲业务集成
- [ ] 写作业务集成
- [ ] Admin 配置界面

### Phase 4: Prompt 类专项（新增）
- [ ] TopicType 新增 `prompt` 类型
- [ ] Prompt 类数据源配置（官方文档/Gallery/社区）
- [ ] Prompt 类识别规则（关键词 + 模型名匹配）
- [ ] Prompt 类结果评分（官方域名加权）
- [ ] 示例提取逻辑（从页面提取 prompt 模板）
- [ ] Prompt Gallery 数据源集成

## 14.1 专业数据源层（2026-07 已实现）

在通用网页检索之上，新增 `mxmcgi/src/core/data-sources/` 模块，与 `search` 并列：

```
Task V2 domainSearch / Smartflow domain_search
        ↓
  DataSourceService.combinedSearch()
        ↓
  ┌─────────────┬──────────────────┐
  │ SearchService│ DataSourceProvider│
  │ (网页检索)   │ (结构化 API)      │
  └─────────────┴──────────────────┘
```

**已接入数据源：**

| Provider | 领域 | 费用 |
|----------|------|------|
| CoinGecko | crypto | 免费 Demo |
| DefiLlama | crypto/DeFi | 免费 |
| Finnhub | stock | 免费层 |
| 北大法宝 MCP | legal | 企业付费 |
| 天眼查 | business | 按次 |

**API 端点：**
- `POST /api/v1/search/datasource/query` — 结构化查询
- `POST /api/v1/search/datasource/combined` — 网页 + 结构化并行
- `GET/POST /api/v1/search/admin/datasource/config` — Admin 配置

**Task V2 字段：** `x-ui-type: domainSearch`（法律/金融/股市/币圈/工商）

## 15. 错误处理

```typescript
// 降级策略
async function searchWithFallback(request: DeepSearchRequest) {
  const providers = ['tavily', 'brave', 'duckduckgo'];

  for (const provider of providers) {
    try {
      return await callProvider(provider, request);
    } catch (error) {
      console.warn(`Provider ${provider} failed:`, error);
      continue;
    }
  }

  throw new Error('All search providers failed');
}
```

## 16. 监控与日志

```typescript
// 搜索统计
interface SearchStats {
  provider: string;
  dimension: SearchDimension;
  query: string;
  resultsCount: number;
  latencyMs: number;
  success: boolean;
}

// 记录到 usage_stats
await recordSearchUsage(stats);
```
