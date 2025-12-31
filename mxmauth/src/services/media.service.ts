/**
 * 媒体服务
 * 使用 Supabase 直接读写 user_media 表
 */

import { getSupabaseClient } from '@mxmai/mxmdata';

export interface MediaItemInput {
  type: string;
  assets_type: string;
  label: string;
  url: string;
  id: string; // 生成任务 ID
  description?: string;
  prompts_meta?: string;
}

export interface MediaListResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
}

export class MediaService {
  private client = getSupabaseClient();

  /**
   * 批量添加用户媒体资源
   */
  async addUserMedia(userId: string, items: MediaItemInput[]): Promise<number> {
    if (!items.length) return 0;

    const payload = items.map((item) => ({
      user_id: userId,
      type: item.type,
      assets_type: item.assets_type,
      label: item.label,
      url: item.url,
      task_id: item.id,
      description: item.description ?? null,
      prompts_meta: item.prompts_meta ?? null,
    }));

    const { error, count } = await this.client
      .from('user_media')
      .insert(payload, { count: 'exact' });

    if (error) {
      throw new Error(`Failed to add user media: ${error.message}`);
    }

    return count ?? items.length;
  }

  /**
   * 查询用户媒体资源列表
   */
  async listUserMedia(
    userId: string,
    options: { type?: string; page?: number; limit?: number }
  ): Promise<MediaListResult> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const offset = (page - 1) * limit;

    let query = this.client
      .from('user_media')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (options.type) {
      query = query.eq('type', options.type);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list user media: ${error.message}`);
    }

    const items = (data || []).map((row) => ({
      id: row.id,
      type: row.type,
      assets_type: row.assets_type,
      label: row.label,
      url: row.url,
      task_id: row.task_id,
      description: row.description,
      prompts_meta: row.prompts_meta,
      created_at: row.created_at,
    }));

    const total = count ?? 0;

    return {
      items,
      total,
      page,
      limit,
    };
  }
}


