/**
 * Knowledge Embedding 路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseKnowledgeScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('knowledge_scope_config');
  }
}
