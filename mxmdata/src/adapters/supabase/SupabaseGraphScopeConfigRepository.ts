/**
 * Graph 业务模型路由配置 Repository
 */
import { SupabaseScopeConfigRepository } from './SupabaseScopeConfigRepository';

export class SupabaseGraphScopeConfigRepository extends SupabaseScopeConfigRepository {
  constructor() {
    super('graph_scope_config');
  }
}
