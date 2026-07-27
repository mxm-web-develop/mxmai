/**
 * Video 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseVideoScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('video_scope_config');
  }
}
