/**
 * Text 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseTextScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('text_scope_config');
  }
}
