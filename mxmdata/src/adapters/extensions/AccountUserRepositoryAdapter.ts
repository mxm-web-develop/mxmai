/**
 * 账户用户 Repository 适配器示例
 * 展示如何扩展基础 IUserRepository 接口
 */

import type {
  IUserRepository,
  User,
  CreateUserDto,
  UpdateUserDto,
  UserSettings,
  UpdateUserSettingsDto,
} from '../../interfaces/IUserRepository';

/**
 * 扩展的用户 Repository 接口
 * 用于 mxmauth 模块，提供额外的账户管理功能
 */
export interface IAccountUserRepository extends IUserRepository {
  /**
   * 更新用户资料
   */
  updateProfile(userId: string, profile: UserProfile): Promise<User>;

  /**
   * 更新用户头像
   */
  updateAvatar(userId: string, avatarUrl: string): Promise<User>;

  /**
   * 获取会员信息
   */
  getMembershipInfo(userId: string): Promise<MembershipInfo>;
}

export interface UserProfile {
  username?: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
}

export interface MembershipInfo {
  membership_type: 'free' | 'pro' | 'premium';
  membership_expires_at?: Date | string;
  level: number;
  balance: number;
}

/**
 * 账户用户 Repository 适配器实现
 * 通过组合基础 Repository 来扩展功能
 */
export class AccountUserRepositoryAdapter implements IAccountUserRepository {
  constructor(private baseRepo: IUserRepository) {}

  // 委托所有基础方法到 baseRepo
  async findById(id: string): Promise<User | null> {
    return this.baseRepo.findById(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.baseRepo.findByEmail(email);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.baseRepo.findByUsername(username);
  }

  async create(user: CreateUserDto): Promise<User> {
    return this.baseRepo.create(user);
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    return this.baseRepo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    return this.baseRepo.delete(id);
  }

  async updateSettings(userId: string, settings: UpdateUserSettingsDto): Promise<UserSettings> {
    return this.baseRepo.updateSettings(userId, settings);
  }

  async getSettings(userId: string): Promise<UserSettings | null> {
    return this.baseRepo.getSettings(userId);
  }

  // 扩展方法实现
  async updateProfile(userId: string, profile: UserProfile): Promise<User> {
    const updateData: UpdateUserDto = {
      ...profile,
    };
    return this.baseRepo.update(userId, updateData);
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    return this.baseRepo.update(userId, { avatar_url: avatarUrl });
  }

  async getMembershipInfo(userId: string): Promise<MembershipInfo> {
    const user = await this.baseRepo.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return {
      membership_type: user.membership_type,
      membership_expires_at: user.membership_expires_at,
      level: user.level,
      balance: user.balance,
    };
  }
}

