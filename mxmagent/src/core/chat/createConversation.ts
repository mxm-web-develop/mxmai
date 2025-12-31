/**
 * 创建对话
 */

import { createConversationRepository } from '@mxmai/mxmdata';
import type { CreateConversationDto, ConversationDetail } from '@mxmai/mxmdata';

// 注意：RepositoryFactory 会在实际使用时自动初始化（延迟初始化）
// 不需要在模块顶层初始化，避免环境变量未加载时的错误

export interface CreateConversationOptions {
  userId: string;
  smartflowId?: string;
  title?: string;
  initialQuery?: {
    content: string;
    type?: 'text' | 'audio' | 'image';
    queryId?: string;
    audioUrl?: string;
    filePaths?: string[] | null;
    currentFiles?: any[] | null;
  };
  initialReply?: {
    content: string;
    type?: 'text' | 'markdown' | 'json';
    flow_chain?: any[];
    recommendQuestion?: string[] | null;
  };
}

/**
 * 创建对话
 */
export async function createConversation(
  options: CreateConversationOptions
): Promise<ConversationDetail> {
  const repository = createConversationRepository();

  const dto: CreateConversationDto = {
    user_id: options.userId,
    smartflow_id: options.smartflowId,
    title: options.title,
  };

  // 如果有初始消息，添加到 initialMessage
  if (options.initialQuery && options.initialReply) {
    const now = new Date().toISOString();
    dto.initialMessage = {
      query: {
        content: options.initialQuery.content,
        type: options.initialQuery.type || 'text',
        queryId: options.initialQuery.queryId || `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        audioUrl: options.initialQuery.audioUrl,
        filePaths: options.initialQuery.filePaths,
        currentFiles: options.initialQuery.currentFiles,
        gmtCreate: now, // 添加必需字段
      },
      reply: {
        content: options.initialReply.content,
        type: options.initialReply.type || 'text',
        flow_chain: options.initialReply.flow_chain,
        recommendQuestion: options.initialReply.recommendQuestion,
        gmtCreate: now, // 添加必需字段
      },
    };
  }

  return await repository.create(dto);
}
