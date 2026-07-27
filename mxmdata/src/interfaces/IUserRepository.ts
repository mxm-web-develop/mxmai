/**
 * 用户数据仓库接口
 * 提供用户基础数据的 CRUD 操作
 */

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  password_hash?: string | null;
  avatar_url?: string;
  level: number;
  balance: number;
  membership_type: 'free' | 'pro' | 'premium';
  membership_expires_at?: Date | string;
  status: 'active' | 'suspended' | 'banned';
  role?: 'user' | 'admin';
  email_verified_at?: Date | string | null;
  mfa_totp_enabled?: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateUserDto {
  username: string;
  email?: string;
  phone?: string;
  password_hash?: string | null;
  avatar_url?: string;
  level?: number;
  balance?: number;
  membership_type?: 'free' | 'pro' | 'premium';
  membership_expires_at?: Date | string;
  status?: 'active' | 'suspended' | 'banned';
  role?: 'user' | 'admin';
  email_verified_at?: Date | string | null;
  mfa_totp_enabled?: boolean;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  phone?: string;
  password_hash?: string | null;
  avatar_url?: string;
  level?: number;
  balance?: number;
  membership_type?: 'free' | 'pro' | 'premium';
  membership_expires_at?: Date | string;
  status?: 'active' | 'suspended' | 'banned';
  role?: 'user' | 'admin';
  email_verified_at?: Date | string | null;
  mfa_totp_enabled?: boolean;
}

import type { AppLocale } from '../i18n/app-locale';

export interface UserSettings {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  /** 产品语言：zh | zh-TW | en | ja */
  language: AppLocale;
  notifications_enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface UpdateUserSettingsDto {
  theme?: 'light' | 'dark' | 'system';
  language?: AppLocale;
  notifications_enabled?: boolean;
}

/**
 * 用户数据仓库基础接口
 */
export interface IUserRepository {
  /**
   * 根据 ID 查找用户
   */
  findById(id: string): Promise<User | null>;

  /**
   * 根据邮箱查找用户
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * 根据用户名查找用户
   */
  findByUsername(username: string): Promise<User | null>;

  /**
   * 创建用户
   */
  create(user: CreateUserDto): Promise<User>;

  /**
   * 更新用户信息
   */
  update(id: string, data: UpdateUserDto): Promise<User>;

  /**
   * 删除用户
   */
  delete(id: string): Promise<void>;

  /**
   * 更新用户设置
   */
  updateSettings(userId: string, settings: UpdateUserSettingsDto): Promise<UserSettings>;

  /**
   * 获取用户设置
   */
  getSettings(userId: string): Promise<UserSettings | null>;

  /**
   * 根据手机号查找用户
   */
  findByPhone(phone: string): Promise<User | null>;

  /**
   * 查询所有用户（管理员功能）
   * @param page 页码（从1开始）
   * @param limit 每页数量
   * @param filters 筛选条件
   */
  findAll(options?: {
    page?: number;
    limit?: number;
    filters?: {
      status?: 'active' | 'suspended' | 'banned';
      role?: 'user' | 'admin';
      search?: string; // 搜索用户名、邮箱、手机号
    };
  }): Promise<{ users: User[]; total: number; page: number; limit: number }>;
}

