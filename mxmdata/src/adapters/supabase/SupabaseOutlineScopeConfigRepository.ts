/**
 * Outline 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseOutlineScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('outline_scope_config');
  }
}
