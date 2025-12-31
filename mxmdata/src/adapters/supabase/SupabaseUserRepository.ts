/**
 * Supabase 用户数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IUserRepository,
  User,
  CreateUserDto,
  UpdateUserDto,
  UserSettings,
  UpdateUserSettingsDto,
} from '../../interfaces/IUserRepository';
import { NotFoundError, DuplicateError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseUserRepository implements IUserRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findById(id: string): Promise<User | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw new DataAccessError(`Failed to find user by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToUser(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding user by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find user by email: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToUser(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding user by email: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find user by username: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToUser(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding user by username: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async create(user: CreateUserDto): Promise<User> {
    try {
      const { data, error } = await this.client
        .from('users')
        .insert({
          username: user.username,
          email: user.email,
          phone: user.phone,
          password_hash: user.password_hash,
          avatar_url: user.avatar_url,
          level: user.level ?? 1,
          balance: user.balance ?? 0,
          membership_type: user.membership_type ?? 'free',
          membership_expires_at: user.membership_expires_at,
          status: user.status ?? 'active',
          role: user.role ?? 'user', // 添加 role 字段支持
        })
        .select()
        .single();

      if (error) {
        // 检查是否是唯一约束冲突
        if (error.code === '23505') {
          const field = error.message.includes('username') ? 'username' : 
                       error.message.includes('email') ? 'email' : 'phone';
          const value = user[field as keyof CreateUserDto] as string;
          throw new DuplicateError('User', field, value);
        }
        throw new DataAccessError(`Failed to create user: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create user: no data returned', 'CREATE_ERROR');
      }

      return this.mapToUser(data);
    } catch (error) {
      if (error instanceof DuplicateError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating user: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    try {
      const updateData: Record<string, any> = {};
      if (data.username !== undefined) updateData.username = data.username;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.password_hash !== undefined) updateData.password_hash = data.password_hash;
      if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;
      if (data.level !== undefined) updateData.level = data.level;
      if (data.balance !== undefined) updateData.balance = data.balance;
      if (data.membership_type !== undefined) updateData.membership_type = data.membership_type;
      if (data.membership_expires_at !== undefined) updateData.membership_expires_at = data.membership_expires_at;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.role !== undefined) updateData.role = data.role; // 添加 role 字段支持
      updateData.updated_at = new Date().toISOString();

      const { data: updatedData, error } = await this.client
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('User', id);
        }
        if (error.code === '23505') {
          const field = error.message.includes('username') ? 'username' : 
                       error.message.includes('email') ? 'email' : 'phone';
          throw new DuplicateError('User', field, updateData[field]);
        }
        throw new DataAccessError(`Failed to update user: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updatedData) {
        throw new NotFoundError('User', id);
      }

      return this.mapToUser(updatedData);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DuplicateError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating user: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('users')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(`Failed to delete user: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error deleting user: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateSettings(userId: string, settings: UpdateUserSettingsDto): Promise<UserSettings> {
    try {
      const updateData: Record<string, any> = {};
      if (settings.theme !== undefined) updateData.theme = settings.theme;
      if (settings.language !== undefined) updateData.language = settings.language;
      if (settings.notifications_enabled !== undefined) updateData.notifications_enabled = settings.notifications_enabled;
      updateData.updated_at = new Date().toISOString();

      // 使用 upsert 确保设置存在
      const { data, error } = await this.client
        .from('user_settings')
        .upsert({
          user_id: userId,
          ...updateData,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to update user settings: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to update user settings: no data returned', 'UPDATE_ERROR');
      }

      return this.mapToUserSettings(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating user settings: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getSettings(userId: string): Promise<UserSettings | null> {
    try {
      const { data, error } = await this.client
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to get user settings: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToUserSettings(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error getting user settings: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    filters?: {
      status?: 'active' | 'suspended' | 'banned';
      role?: 'user' | 'admin';
      search?: string;
    };
  }): Promise<{ users: User[]; total: number; page: number; limit: number }> {
    try {
      const page = options?.page ?? 1;
      const limit = options?.limit ?? 20;
      const offset = (page - 1) * limit;

      let query = this.client.from('users').select('*', { count: 'exact' });

      // 应用筛选条件
      if (options?.filters) {
        if (options.filters.status) {
          query = query.eq('status', options.filters.status);
        }
        if (options.filters.role) {
          query = query.eq('role', options.filters.role);
        }
        if (options.filters.search) {
          const searchTerm = `%${options.filters.search}%`;
          // PostgREST or 查询语法：column1.operator.value,column2.operator.value
          query = query.or(`username.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`);
        }
      }

      // 分页
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new DataAccessError(`Failed to find all users: ${error.message}`, 'QUERY_ERROR', error);
      }

      const users = (data || []).map((item) => this.mapToUser(item));

      return {
        users,
        total: count ?? 0,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding all users: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  /**
   * 将数据库记录映射为 User 类型
   */
  private mapToUser(data: any): User {
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      phone: data.phone,
      password_hash: data.password_hash,
      avatar_url: data.avatar_url,
      level: data.level ?? 1,
      balance: parseFloat(data.balance ?? 0),
      membership_type: data.membership_type ?? 'free',
      membership_expires_at: data.membership_expires_at,
      status: data.status ?? 'active',
      role: data.role ?? 'user',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * 将数据库记录映射为 UserSettings 类型
   */
  private mapToUserSettings(data: any): UserSettings {
    return {
      user_id: data.user_id,
      theme: data.theme ?? 'system',
      language: data.language ?? 'zh',
      notifications_enabled: data.notifications_enabled ?? true,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}

