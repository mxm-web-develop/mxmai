/**
 * Character模块类型定义
 */

// 重新导出Character类型
export type { Character } from '@mxmai/mxmdata';

/**
 * CharacterProfile格式（用于写作模块）
 * 兼容现有的CharacterProfile接口
 */
export interface CharacterProfile {
  id: string;
  name: string;
  nickname?: string;
  age?: string;
  appearance?: string;
  voice_description?: string;
  clothing_style?: string;
  personality?: string;
  others?: string;
  category?: string[];
  tags?: string[];
}

/**
 * 角色完善标记
 */
export interface CharacterCompleteness {
  hasProfileImages: boolean;
  hasProfileAudio: boolean;
  hasProfileVideo: boolean;
}
