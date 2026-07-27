/**
 * Audio 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseAudioScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('audio_scope_config');
  }
}
