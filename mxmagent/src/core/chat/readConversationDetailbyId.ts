/**
 * 根据 ID 读取对话详情
 */

import { createConversationRepository } from '@mxmai/mxmdata';
import type { ConversationDetail } from '@mxmai/mxmdata';

// 注意：RepositoryFactory 会在实际使用时自动初始化（延迟初始化）
// 不需要在模块顶层初始化，避免环境变量未加载时的错误

export interface ReadConversationOptions {
  conversationId: string;
  userId: string;
}

/**
 * 根据 ID 读取对话详情
 */
export async function readConversationDetailbyId(
  options: ReadConversationOptions
): Promise<ConversationDetail | null> {
  const repository = createConversationRepository();

  return await repository.findById(options.conversationId, options.userId);
}

/**
 * 根据用户 ID 获取对话列表
 */
export async function getConversationsByUserId(
  userId: string,
  limit?: number,
  offset?: number
): Promise<ConversationDetail[]> {
  const repository = createConversationRepository();

  return await repository.findByUserId(userId, limit, offset);
}
