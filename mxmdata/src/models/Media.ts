/**
 * 媒体资产数据模型
 */

export interface MediaAsset {
  id: string;
  user_id: string;
  task_id?: string;
  step_id?: string;
  type: 'photo' | 'video' | 'music' | 'illustration' | 'text' | 'voice';
  title?: string;
  file_url: string;
  thumbnail_url?: string;
  file_size?: number;
  duration?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, any>;
  is_favorite?: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface MediaQueryOptions {
  type?: 'photo' | 'video' | 'music' | 'illustration' | 'text' | 'voice';
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
  is_favorite?: boolean;
}

