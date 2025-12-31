/**
 * 对话数据仓库接口
 * 提供对话数据的 CRUD 操作
 */

import type {
  ConversationDetail,
  CreateConversationDto,
  UpdateConversationDto,
  AddMessageDto,
} from '../models/Conversation';

/**
 * 对话数据仓库接口
 */
export interface IConversationRepository {
  /**
   * 根据 ID 查找对话详情
   */
  findById(conversationId: string, userId: string): Promise<ConversationDetail | null>;

  /**
   * 根据用户 ID 查找所有对话列表
   */
  findByUserId(userId: string, limit?: number, offset?: number): Promise<ConversationDetail[]>;

  /**
   * 创建对话
   */
  create(data: CreateConversationDto): Promise<ConversationDetail>;

  /**
   * 更新对话信息
   */
  update(conversationId: string, userId: string, data: UpdateConversationDto): Promise<ConversationDetail>;

  /**
   * 删除对话
   */
  delete(conversationId: string, userId: string): Promise<void>;

  /**
   * 添加消息到对话
   */
  addMessage(conversationId: string, userId: string, message: AddMessageDto): Promise<ConversationDetail>;
}
