/**
 * 用户媒体资产仓库接口
 * 扩展 IUserRepository，提供用户多媒体查询功能
 */

import type { MediaAsset, MediaQueryOptions } from '../models/Media';

export interface IUserMediaRepository {
  /**
   * 获取用户的媒体资产列表
   */
  getUserMediaAssets(userId: string, options?: MediaQueryOptions): Promise<MediaAsset[]>;

  /**
   * 获取用户的媒体资产总数
   */
  getUserMediaCount(userId: string, options?: Omit<MediaQueryOptions, 'limit' | 'offset'>): Promise<number>;

  /**
   * 根据 ID 获取媒体资产
   */
  getMediaAssetById(mediaId: string): Promise<MediaAsset | null>;

  /**
   * 获取用户收藏的媒体资产
   */
  getUserFavoriteMedia(userId: string, options?: Omit<MediaQueryOptions, 'is_favorite'>): Promise<MediaAsset[]>;
}

