/**
 * Agent Chat v2 Repository 接口
 */

import type {
  AgentConversation,
  AgentMessage,
  AgentRun,
  AgentRunEvent,
  AgentRunStatus,
  CreateAgentConversationDto,
  UpdateAgentConversationDto,
  CreateAgentMessageDto,
  CreateAgentRunDto,
  UpdateAgentRunDto,
  AppendAgentRunEventDto,
} from '../models/AgentConversation';

export interface IAgentConversationRepository {
  create(data: CreateAgentConversationDto): Promise<AgentConversation>;
  findById(id: string, userId: string): Promise<AgentConversation | null>;
  listByUserId(userId: string, limit?: number, offset?: number): Promise<AgentConversation[]>;
  update(id: string, userId: string, data: UpdateAgentConversationDto): Promise<AgentConversation>;
  softDelete(id: string, userId: string): Promise<void>;

  createMessage(data: CreateAgentMessageDto): Promise<AgentMessage>;
  listMessages(conversationId: string, userId: string, limit?: number, before?: string): Promise<AgentMessage[]>;

  createRun(data: CreateAgentRunDto): Promise<AgentRun>;
  findRunById(runId: string): Promise<AgentRun | null>;
  updateRun(runId: string, data: UpdateAgentRunDto): Promise<AgentRun>;
  claimQueuedRuns(workerId: string, limit?: number): Promise<AgentRun[]>;
  listActiveRunsByConversation(conversationId: string): Promise<AgentRun[]>;
  markStaleRunsFailed(staleBeforeIso: string, error: string): Promise<number>;

  appendEvent(data: AppendAgentRunEventDto): Promise<AgentRunEvent>;
  listEventsAfter(conversationId: string, afterSeq: number, limit?: number): Promise<AgentRunEvent[]>;
  listEventsByRun(runId: string, afterSeq?: number): Promise<AgentRunEvent[]>;
  getMaxSeq(conversationId: string): Promise<number>;

  listQueuedRunIds(limit?: number): Promise<string[]>;
  getRunsByStatus(status: AgentRunStatus, limit?: number): Promise<AgentRun[]>;
}
