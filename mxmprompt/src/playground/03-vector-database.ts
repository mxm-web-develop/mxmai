/**
 * 向量数据库流程演示
 * 
 * 演示内容：
 * 1. 生成 Embedding（向量化）
 * 2. 存储向量到数据库
 * 3. 向量相似度搜索
 * 4. 混合搜索（向量 + 元数据过滤）
 * 5. RAG 召回完整流程
 */

import { DeerAPIEmbeddings } from './utils/deerapi-embeddings';
import dotenv from 'dotenv';

dotenv.config();

// ==================== 类型定义 ====================

interface VectorSearchResult {
  id: string;
  data: any;
  similarity: number;
}

interface PhotographyStyle {
  id: string;
  name: string;
  description: string;
  category: string;
  promptTemplate: string;
  embedding?: number[];
}

interface GenerationCase {
  id: string;
  taskId: string;
  originalPrompt: string;
  optimizedPrompt: string;
  renderParams: any;
  embedding?: number[];
}

// ==================== Embedding 服务 ====================

/**
 * 初始化 Embedding 服务（使用 DeerAPI）
 */
function initEmbeddingService() {
  return DeerAPIEmbeddings.fromEnv('text-embedding-3-small');
}

/**
 * 生成文本的 Embedding
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = initEmbeddingService();
  const vector = await embeddings.embedQuery(text);
  return vector;
}

/**
 * 批量生成 Embedding
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings = initEmbeddingService();
  const vectors = await embeddings.embedDocuments(texts);
  return vectors;
}

// ==================== 模拟向量数据库操作 ====================

/**
 * 模拟向量数据库存储
 * 实际应该使用 pgvector (Supabase) 或专门的向量数据库
 */
class MockVectorDatabase {
  private styles: Map<string, PhotographyStyle> = new Map();
  private cases: Map<string, GenerationCase> = new Map();

  /**
   * 存储摄影风格向量
   */
  async storeStyle(style: PhotographyStyle): Promise<string> {
    const id = style.id || `style-${Date.now()}`;
    this.styles.set(id, { ...style, id });
    console.log(`✅ 存储风格: ${style.name} (ID: ${id})`);
    return id;
  }

  /**
   * 存储生成案例向量
   */
  async storeCase(case_: GenerationCase): Promise<string> {
    const id = case_.id || `case-${Date.now()}`;
    this.cases.set(id, { ...case_, id });
    console.log(`✅ 存储案例: ${case_.id} (ID: ${id})`);
    return id;
  }

  /**
   * 向量相似度搜索（余弦相似度）
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 搜索相似风格
   */
  async searchSimilarStyles(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [id, style] of this.styles.entries()) {
      if (!style.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, style.embedding);
      
      if (similarity >= threshold) {
        results.push({
          id,
          data: style,
          similarity
        });
      }
    }

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit);
  }

  /**
   * 搜索相似案例
   */
  async searchSimilarCases(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [id, case_] of this.cases.entries()) {
      if (!case_.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, case_.embedding);
      
      if (similarity >= threshold) {
        results.push({
          id,
          data: case_,
          similarity
        });
      }
    }

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit);
  }

  /**
   * 混合搜索（向量 + 元数据过滤）
   */
  async hybridSearchStyles(
    queryEmbedding: number[],
    filters: {
      category?: string;
      name?: string;
    },
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    // 先进行向量搜索
    const vectorResults = await this.searchSimilarStyles(queryEmbedding, limit * 2, 0.5);

    // 应用元数据过滤
    let filtered = vectorResults;
    
    if (filters.category) {
      filtered = filtered.filter(r => r.data.category === filters.category);
    }
    
    if (filters.name) {
      filtered = filtered.filter(r => 
        r.data.name.toLowerCase().includes(filters.name!.toLowerCase())
      );
    }

    return filtered.slice(0, limit);
  }
}

// ==================== 演示函数 ====================

/**
 * 演示1: 生成和存储向量
 */
async function demoStoreVectors() {
  console.log('\n=== 演示1: 生成和存储向量 ===\n');

  const db = new MockVectorDatabase();

  // 准备摄影风格数据
  const styles: Omit<PhotographyStyle, 'id' | 'embedding'>[] = [
    {
      name: 'Portrait Photography',
      description: 'Professional portrait photography with studio lighting',
      category: 'portrait',
      promptTemplate: 'portrait photography, professional, studio lighting, high quality, detailed'
    },
    {
      name: 'Fashion Photography',
      description: 'Fashion photography with dramatic lighting and styling',
      category: 'fashion',
      promptTemplate: 'fashion photography, dramatic lighting, professional styling, editorial'
    },
    {
      name: 'Street Photography',
      description: 'Candid street photography with natural lighting',
      category: 'street',
      promptTemplate: 'street photography, candid, natural light, documentary style'
    }
  ];

  // 生成 Embedding 并存储
  for (const style of styles) {
    const embedding = await generateEmbedding(style.promptTemplate);
    await db.storeStyle({
      ...style,
      id: `style-${Date.now()}-${Math.random()}`,
      embedding
    });
  }

  console.log('\n✅ 所有风格向量已存储');
}

/**
 * 演示2: 向量相似度搜索
 */
async function demoVectorSearch() {
  console.log('\n=== 演示2: 向量相似度搜索 ===\n');

  const db = new MockVectorDatabase();

  // 先存储一些数据
  const styles = [
    {
      name: 'Portrait Photography',
      description: 'Professional portrait photography',
      category: 'portrait',
      promptTemplate: 'portrait photography, professional, studio lighting, high quality'
    },
    {
      name: 'Fashion Photography',
      description: 'Fashion photography',
      category: 'fashion',
      promptTemplate: 'fashion photography, dramatic lighting, professional styling'
    }
  ];

  for (const style of styles) {
    const embedding = await generateEmbedding(style.promptTemplate);
    await db.storeStyle({
      ...style,
      id: `style-${Date.now()}-${Math.random()}`,
      embedding
    });
  }

  // 搜索查询
  const query = 'portrait photography with natural light';
  console.log(`🔍 搜索查询: "${query}"\n`);

  const queryEmbedding = await generateEmbedding(query);
  const results = await db.searchSimilarStyles(queryEmbedding, 5, 0.5);

  console.log('搜索结果:');
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.data.name}`);
    console.log(`   相似度: ${(result.similarity * 100).toFixed(2)}%`);
    console.log(`   描述: ${result.data.description}\n`);
  });
}

/**
 * 演示3: 混合搜索
 */
async function demoHybridSearch() {
  console.log('\n=== 演示3: 混合搜索（向量 + 元数据过滤） ===\n');

  const db = new MockVectorDatabase();

  // 存储数据
  const styles = [
    {
      name: 'Portrait Photography',
      category: 'portrait',
      promptTemplate: 'portrait photography, professional, studio lighting'
    },
    {
      name: 'Fashion Portrait',
      category: 'fashion',
      promptTemplate: 'fashion portrait, dramatic lighting, professional'
    },
    {
      name: 'Street Portrait',
      category: 'street',
      promptTemplate: 'street portrait, natural light, candid'
    }
  ];

  for (const style of styles) {
    const embedding = await generateEmbedding(style.promptTemplate);
    await db.storeStyle({
      ...style,
      description: style.name,
      id: `style-${Date.now()}-${Math.random()}`,
      embedding
    });
  }

  // 混合搜索：向量搜索 + 分类过滤
  const query = 'portrait photography';
  console.log(`🔍 搜索查询: "${query}"`);
  console.log(`📋 过滤条件: category = "portrait"\n`);

  const queryEmbedding = await generateEmbedding(query);
  const results = await db.hybridSearchStyles(queryEmbedding, {
    category: 'portrait'
  }, 5);

  console.log('搜索结果:');
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.data.name} (${result.data.category})`);
    console.log(`   相似度: ${(result.similarity * 100).toFixed(2)}%\n`);
  });
}

/**
 * 演示4: RAG 召回完整流程
 */
async function demoRAGRetrieval() {
  console.log('\n=== 演示4: RAG 召回完整流程 ===\n');

  const db = new MockVectorDatabase();

  // 存储生成案例
  const cases = [
    {
      taskId: 'task-1',
      originalPrompt: 'portrait photography',
      optimizedPrompt: 'portrait photography, close-up, studio lighting, professional, high quality, detailed',
      renderParams: { scene: 'close-up', lighting: 'studio' }
    },
    {
      taskId: 'task-2',
      originalPrompt: 'fashion photography',
      optimizedPrompt: 'fashion photography, medium-shot, dramatic lighting, editorial style, professional',
      renderParams: { scene: 'medium-shot', lighting: 'dramatic' }
    }
  ];

  for (const case_ of cases) {
    const embedding = await generateEmbedding(case_.optimizedPrompt);
    await db.storeCase({
      ...case_,
      id: `case-${Date.now()}-${Math.random()}`,
      embedding
    });
  }

  // RAG 召回
  const userQuery = 'portrait photography with studio lighting';
  console.log(`👤 用户查询: "${userQuery}"\n`);

  const queryEmbedding = await generateEmbedding(userQuery);
  const results = await db.searchSimilarCases(queryEmbedding, 5, 0.5);

  console.log('📚 RAG 召回结果:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. 案例 ID: ${result.data.taskId}`);
    console.log(`   原始提示词: ${result.data.originalPrompt}`);
    console.log(`   优化提示词: ${result.data.optimizedPrompt}`);
    console.log(`   渲染参数: ${JSON.stringify(result.data.renderParams)}`);
    console.log(`   相似度: ${(result.similarity * 100).toFixed(2)}%`);
  });

  console.log('\n💡 这些案例可以作为提示词优化的参考');
}

// ==================== 主函数 ====================

async function main() {
  try {
    await demoStoreVectors();
    await demoVectorSearch();
    await demoHybridSearch();
    await demoRAGRetrieval();

    console.log('\n✅ 所有演示完成！\n');
  } catch (error) {
    console.error('❌ 演示失败:', error);
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
    }
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

export {
  initEmbeddingService,
  generateEmbedding,
  generateEmbeddings,
  MockVectorDatabase,
  demoStoreVectors,
  demoVectorSearch,
  demoHybridSearch,
  demoRAGRetrieval
};

