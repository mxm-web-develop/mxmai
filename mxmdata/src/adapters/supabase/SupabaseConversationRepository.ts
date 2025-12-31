/**
 * Supabase 对话数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IConversationRepository,
} from '../../interfaces/IConversationRepository';
import type {
  ConversationDetail,
  CreateConversationDto,
  UpdateConversationDto,
  AddMessageDto,
} from '../../models/Conversation';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseConversationRepository implements IConversationRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  /**
   * 根据 ID 查找对话详情
   */
  async findById(conversationId: string, userId: string): Promise<ConversationDetail | null> {
    try {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find conversation by id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapToConversationDetail(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding conversation by id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 根据用户 ID 查找所有对话列表
   */
  async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ConversationDetail[]> {
    try {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(
          `Failed to find conversations by user id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToConversationDetail(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding conversations by user id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 创建对话
   */
  async create(data: CreateConversationDto): Promise<ConversationDetail> {
    try {
      const conversationData = {
        id: data.id || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: data.user_id,
        smartflow_id: data.smartflow_id || null,
        title: data.title || null,
        messages: data.initialMessage ? [data.initialMessage] : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: result, error } = await this.client
        .from('conversations')
        .insert(conversationData)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create conversation: ${error.message}`,
          'CREATE_ERROR',
          error
        );
      }

      return this.mapToConversationDetail(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating conversation: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 更新对话信息
   */
  async update(
    conversationId: string,
    userId: string,
    data: UpdateConversationDto
  ): Promise<ConversationDetail> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (data.title !== undefined) {
        updateData.title = data.title;
      }

      const { data: result, error } = await this.client
        .from('conversations')
        .update(updateData)
        .eq('id', conversationId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Conversation', conversationId);
        }
        throw new DataAccessError(
          `Failed to update conversation: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapToConversationDetail(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating conversation: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 删除对话
   */
  async delete(conversationId: string, userId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId);

      if (error) {
        throw new DataAccessError(
          `Failed to delete conversation: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting conversation: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 添加消息到对话
   */
  async addMessage(
    conversationId: string,
    userId: string,
    message: AddMessageDto
  ): Promise<ConversationDetail> {
    try {
      // 先获取当前对话
      const conversation = await this.findById(conversationId, userId);
      if (!conversation) {
        throw new NotFoundError('Conversation', conversationId);
      }

      // 构建新的消息
      const now = new Date().toISOString();
      const newMessage = {
        query: {
          ...message.query,
          gmtCreate: message.query.gmtCreate || now, // 如果已提供则使用，否则使用当前时间
          id: conversation.messages.length * 2 + 1, // 简单的 ID 生成
        },
        reply: {
          ...message.reply,
          gmtCreate: message.reply.gmtCreate || now, // 如果已提供则使用，否则使用当前时间
          id: conversation.messages.length * 2 + 2,
        },
      };

      // 更新消息列表
      const updatedMessages = [...conversation.messages, newMessage];

      const { data: result, error } = await this.client
        .from('conversations')
        .update({
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to add message to conversation: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapToConversationDetail(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error adding message to conversation: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 将数据库记录映射为 ConversationDetail
   */
  private mapToConversationDetail(data: any): ConversationDetail {
    return {
      id: data.id,
      user_id: data.user_id,
      smartflow_id: data.smartflow_id,
      title: data.title,
      messages: data.messages || [],
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
