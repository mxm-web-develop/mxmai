/**
 * 知识库默认绑定 Repository 接口
 * Admin 可配置各业务场景的默认知识库
 */

export interface KnowledgeBaseDefault {
  id: string;
  scope: string;
  category: string;
  sub_type: string;
  knowledge_base_id: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateKnowledgeBaseDefaultDto {
  scope: string;
  category: string;
  sub_type: string;
  knowledge_base_id: string;
}

export interface IKnowledgeBaseDefaultsRepository {
  /**
   * 获取指定 slot 的默认知识库 ID
   */
  getDefault(scope: string, category: string, subType: string): Promise<string | null>;

  /**
   * 设置默认知识库（存在则更新）
   */
  setDefault(data: CreateKnowledgeBaseDefaultDto): Promise<KnowledgeBaseDefault>;

  /**
   * 移除默认绑定
   */
  removeDefault(scope: string, category: string, subType: string): Promise<void>;

  /**
   * 列出所有默认绑定
   */
  listDefaults(scope?: string): Promise<KnowledgeBaseDefault[]>;
}
