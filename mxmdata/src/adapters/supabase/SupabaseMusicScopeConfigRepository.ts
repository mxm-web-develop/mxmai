/**
 * Music 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseMusicScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('music_scope_config');
  }
}
