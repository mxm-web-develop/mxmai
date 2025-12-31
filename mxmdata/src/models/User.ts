/**
 * 用户数据模型
 * 与 IUserRepository 接口中的类型定义保持一致
 */

import type { User, CreateUserDto, UpdateUserDto, UserSettings, UpdateUserSettingsDto } from '../interfaces/IUserRepository';

export type { User, CreateUserDto, UpdateUserDto, UserSettings, UpdateUserSettingsDto };

/**
 * 用户基本信息（不包含敏感信息）
 */
export interface UserPublic {
  id: string;
  username: string;
  email?: string;
  avatar_url?: string;
  level: number;
  membership_type: 'free' | 'pro' | 'premium';
  created_at: Date | string;
}

/**
 * 将 User 转换为 UserPublic
 */
export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar_url: user.avatar_url,
    level: user.level,
    membership_type: user.membership_type,
    created_at: user.created_at,
  };
}

