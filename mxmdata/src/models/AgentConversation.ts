/**
 * Agent Chat v2 数据模型
 */

export type AgentConversationStatus = 'active' | 'archived' | 'deleted';

export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_task'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentReferenceType = 'folder' | 'knowledge' | 'business' | 'file';

export interface AgentMessagePart {
  type: 'text' | 'image' | 'file';
  text?: string;
  url?: string;
  mimeType?: string;
  name?: string;
}

export interface AgentReference {
  type: AgentReferenceType;
  id: string;
  label?: string;
  /** business 引用时可带 scope/taskKey/subtype */
  scope?: string;
  taskKey?: string;
  subtype?: string;
  /** file：所属虚拟文件夹 */
  folderId?: string;
  /** file：task | storage_object */
  refType?: 'task' | 'storage_object';
  contentType?: string;
}

export interface AgentConversation {
  id: string;
  user_id: string;
  title: string | null;
  status: AgentConversationStatus;
  summary: string | null;
  /** 模块 Agent 硬绑定 scope；主助手为 null */
  scope: string | null;
  /** UI 语言：zh | en；影响助手回复语言 */
  locale: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: AgentMessageRole;
  content: AgentMessagePart[];
  references: AgentReference[];
  run_id: string | null;
  created_at: string;
}

export interface AgentRunUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  loop_rounds?: number;
  tool_calls?: number;
}

export interface AgentRun {
  id: string;
  conversation_id: string;
  user_id: string;
  message_id: string | null;
  status: AgentRunStatus;
  error: string | null;
  usage: AgentRunUsage | null;
  heartbeat_at: string | null;
  claimed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentRunEventType =
  | 'run_started'
  | 'thinking'
  | 'text_delta'
  | 'tool_call'
  | 'tool_result'
  | 'task_created'
  | 'task_progress'
  | 'task_done'
  | 'message'
  | 'error'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled';

export interface AgentRunEvent {
  id: number;
  run_id: string;
  conversation_id: string;
  seq: number;
  type: AgentRunEventType | string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateAgentConversationDto {
  id?: string;
  user_id: string;
  title?: string | null;
  scope?: string | null;
  locale?: string | null;
}

export interface UpdateAgentConversationDto {
  title?: string | null;
  status?: AgentConversationStatus;
  summary?: string | null;
  last_message_at?: string | null;
  locale?: string | null;
}

export interface CreateAgentMessageDto {
  id?: string;
  conversation_id: string;
  user_id: string;
  role: AgentMessageRole;
  content: AgentMessagePart[];
  references?: AgentReference[];
  run_id?: string | null;
}

export interface CreateAgentRunDto {
  id?: string;
  conversation_id: string;
  user_id: string;
  message_id?: string | null;
  status?: AgentRunStatus;
}

export interface UpdateAgentRunDto {
  status?: AgentRunStatus;
  error?: string | null;
  usage?: AgentRunUsage | null;
  heartbeat_at?: string | null;
  claimed_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  message_id?: string | null;
}

export interface AppendAgentRunEventDto {
  run_id: string;
  conversation_id: string;
  type: AgentRunEventType | string;
  payload?: Record<string, unknown>;
}
