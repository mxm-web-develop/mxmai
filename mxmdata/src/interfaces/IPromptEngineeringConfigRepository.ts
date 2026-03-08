/**
 * 提示词工程配置数据仓库接口
 */

import type {
  PromptEngineeringConfig,
  CreatePromptEngineeringConfigDto,
  UpdatePromptEngineeringConfigDto,
} from '../models/PromptEngineeringConfig';

export interface ListPromptConfigOptions {
  scope?: string;
  type?: string;
  subtype?: string | null;
  limit?: number;
  offset?: number;
}

export interface IPromptEngineeringConfigRepository {
  findByKey(scope: string, type: string, subtype?: string | null): Promise<PromptEngineeringConfig | null>;

  list(options?: ListPromptConfigOptions): Promise<{ items: PromptEngineeringConfig[]; total: number }>;

  upsert(dto: CreatePromptEngineeringConfigDto): Promise<PromptEngineeringConfig>;

  delete(id: string): Promise<void>;

  findById(id: string): Promise<PromptEngineeringConfig | null>;
}
