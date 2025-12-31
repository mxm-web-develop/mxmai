/**
 * 知识库注册表
 * 定义内置知识库和用户扩展接口
 */

/**
 * 知识库配置
 */
export interface KnowledgeBaseConfig {
  name: string;                    // 知识库名称
  displayName: string;             // 显示名称
  description: string;             // 描述
  type: 'vector' | 'keyword' | 'hybrid';  // 知识库类型
  tableName?: string;              // 数据库表名（如果使用 Supabase）
  embeddingModel?: string;          // 使用的 embedding 模型
  isBuiltin: boolean;              // 是否为内置知识库
  isPublic?: boolean;              // 是否公开（用户可访问）
}

/**
 * 内置知识库配置
 */
export const BUILTIN_KNOWLEDGE_BASES: Record<string, KnowledgeBaseConfig> = {
  'general': {
    name: 'general',
    displayName: '通用知识库',
    description: '通用领域知识库，包含各种常见知识',
    type: 'hybrid',
    tableName: 'knowledge_base_general',
    embeddingModel: 'text-embedding-3-small',
    isBuiltin: true,
    isPublic: true,
  },
  
  'technical': {
    name: 'technical',
    displayName: '技术知识库',
    description: '技术相关专业知识库',
    type: 'hybrid',
    tableName: 'knowledge_base_technical',
    embeddingModel: 'text-embedding-3-small',
    isBuiltin: true,
    isPublic: true,
  },
  
  // 可以继续添加更多内置知识库
};

/**
 * 用户自定义知识库存储（运行时）
 * 实际应该存储在数据库中
 */
const userKnowledgeBases: Map<string, KnowledgeBaseConfig> = new Map();

/**
 * 获取知识库配置
 */
export function getKnowledgeBase(name: string): KnowledgeBaseConfig | undefined {
  // 先查找内置知识库
  if (BUILTIN_KNOWLEDGE_BASES[name]) {
    return BUILTIN_KNOWLEDGE_BASES[name];
  }
  
  // 再查找用户自定义知识库
  return userKnowledgeBases.get(name);
}

/**
 * 获取所有可用的知识库
 */
export function getAllKnowledgeBases(userId?: string): KnowledgeBaseConfig[] {
  const all: KnowledgeBaseConfig[] = [];
  
  // 添加所有内置知识库
  Object.values(BUILTIN_KNOWLEDGE_BASES).forEach(kb => {
    if (kb.isPublic) {
      all.push(kb);
    }
  });
  
  // 添加用户自定义知识库（如果提供了 userId）
  if (userId) {
    userKnowledgeBases.forEach(kb => {
      all.push(kb);
    });
  }
  
  return all;
}

/**
 * 注册用户自定义知识库
 */
export function registerUserKnowledgeBase(
  config: KnowledgeBaseConfig
): void {
  if (config.isBuiltin) {
    throw new Error('不能注册内置知识库');
  }
  
  userKnowledgeBases.set(config.name, config);
}

/**
 * 验证知识库是否存在
 */
export function validateKnowledgeBase(name: string): boolean {
  return !!getKnowledgeBase(name);
}

/**
 * 获取知识库的检索类型
 */
export function getKnowledgeBaseType(name: string): 'vector' | 'keyword' | 'hybrid' | undefined {
  const kb = getKnowledgeBase(name);
  return kb?.type;
}
