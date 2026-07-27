/**
 * Writing 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseWritingScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('writing_scope_config');
  }
}
