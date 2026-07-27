/**
 * Supabase Agent Chat v2 Repository
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { IAgentConversationRepository } from '../../interfaces/IAgentConversationRepository';
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
} from '../../models/AgentConversation';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapConversation(row: any): AgentConversation {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title ?? null,
    status: row.status ?? 'active',
    summary: row.summary ?? null,
    scope: row.scope ?? null,
    locale: row.locale ?? null,
    last_message_at: row.last_message_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMessage(row: any): AgentMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    role: row.role,
    content: Array.isArray(row.content) ? row.content : [],
    references: Array.isArray(row.references_json) ? row.references_json : [],
    run_id: row.run_id ?? null,
    created_at: row.created_at,
  };
}

function mapRun(row: any): AgentRun {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    message_id: row.message_id ?? null,
    status: row.status,
    error: row.error ?? null,
    usage: row.usage ?? null,
    heartbeat_at: row.heartbeat_at ?? null,
    claimed_by: row.claimed_by ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapEvent(row: any): AgentRunEvent {
  return {
    id: Number(row.id),
    run_id: row.run_id,
    conversation_id: row.conversation_id,
    seq: Number(row.seq),
    type: row.type,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    created_at: row.created_at,
  };
}

export class SupabaseAgentConversationRepository implements IAgentConversationRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async create(data: CreateAgentConversationDto): Promise<AgentConversation> {
    try {
      const now = new Date().toISOString();
      const row = {
        id: data.id || newId('aconv'),
        user_id: data.user_id,
        title: data.title ?? null,
        status: 'active',
        summary: null,
        scope: data.scope ?? null,
        locale: data.locale ?? null,
        last_message_at: null,
        created_at: now,
        updated_at: now,
      };
      const { data: result, error } = await this.client
        .from('agent_conversations')
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new DataAccessError(`Failed to create agent conversation: ${error.message}`, 'CREATE_ERROR', error);
      }
      return mapConversation(result);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error creating agent conversation: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async findById(id: string, userId: string): Promise<AgentConversation | null> {
    try {
      const { data, error } = await this.client
        .from('agent_conversations')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .maybeSingle();
      if (error) {
        throw new DataAccessError(`Failed to find agent conversation: ${error.message}`, 'QUERY_ERROR', error);
      }
      return data ? mapConversation(data) : null;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error finding agent conversation: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async listByUserId(userId: string, limit = 50, offset = 0): Promise<AgentConversation[]> {
    try {
      const { data, error } = await this.client
        .from('agent_conversations')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        throw new DataAccessError(`Failed to list agent conversations: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(mapConversation);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error listing agent conversations: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async update(id: string, userId: string, data: UpdateAgentConversationDto): Promise<AgentConversation> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.title !== undefined) patch.title = data.title;
      if (data.status !== undefined) patch.status = data.status;
      if (data.summary !== undefined) patch.summary = data.summary;
      if (data.last_message_at !== undefined) patch.last_message_at = data.last_message_at;
      if (data.locale !== undefined) patch.locale = data.locale;

      const { data: result, error } = await this.client
        .from('agent_conversations')
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) {
        if (error.code === 'PGRST116') throw new NotFoundError('AgentConversation', id);
        throw new DataAccessError(`Failed to update agent conversation: ${error.message}`, 'UPDATE_ERROR', error);
      }
      return mapConversation(result);
    } catch (err) {
      if (err instanceof DataAccessError || err instanceof NotFoundError) throw err;
      throw new DataAccessError(`Unexpected error updating agent conversation: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await this.update(id, userId, { status: 'deleted' });
  }

  async createMessage(data: CreateAgentMessageDto): Promise<AgentMessage> {
    try {
      const now = new Date().toISOString();
      const row = {
        id: data.id || newId('amsg'),
        conversation_id: data.conversation_id,
        user_id: data.user_id,
        role: data.role,
        content: data.content ?? [],
        references_json: data.references ?? [],
        run_id: data.run_id ?? null,
        created_at: now,
      };
      const { data: result, error } = await this.client
        .from('agent_messages')
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new DataAccessError(`Failed to create agent message: ${error.message}`, 'CREATE_ERROR', error);
      }

      await this.client
        .from('agent_conversations')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', data.conversation_id)
        .eq('user_id', data.user_id);

      return mapMessage(result);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error creating agent message: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async listMessages(
    conversationId: string,
    userId: string,
    limit = 100,
    before?: string
  ): Promise<AgentMessage[]> {
    try {
      let query = this.client
        .from('agent_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (before) {
        query = query.lt('created_at', before);
      }
      const { data, error } = await query;
      if (error) {
        throw new DataAccessError(`Failed to list agent messages: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(mapMessage).reverse();
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error listing agent messages: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async createRun(data: CreateAgentRunDto): Promise<AgentRun> {
    try {
      const now = new Date().toISOString();
      const row = {
        id: data.id || newId('arun'),
        conversation_id: data.conversation_id,
        user_id: data.user_id,
        message_id: data.message_id ?? null,
        status: data.status ?? 'queued',
        error: null,
        usage: null,
        heartbeat_at: null,
        claimed_by: null,
        started_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      };
      const { data: result, error } = await this.client
        .from('agent_runs')
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new DataAccessError(`Failed to create agent run: ${error.message}`, 'CREATE_ERROR', error);
      }
      return mapRun(result);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error creating agent run: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async findRunById(runId: string): Promise<AgentRun | null> {
    try {
      const { data, error } = await this.client
        .from('agent_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle();
      if (error) {
        throw new DataAccessError(`Failed to find agent run: ${error.message}`, 'QUERY_ERROR', error);
      }
      return data ? mapRun(data) : null;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error finding agent run: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async updateRun(runId: string, data: UpdateAgentRunDto): Promise<AgentRun> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.status !== undefined) patch.status = data.status;
      if (data.error !== undefined) patch.error = data.error;
      if (data.usage !== undefined) patch.usage = data.usage;
      if (data.heartbeat_at !== undefined) patch.heartbeat_at = data.heartbeat_at;
      if (data.claimed_by !== undefined) patch.claimed_by = data.claimed_by;
      if (data.started_at !== undefined) patch.started_at = data.started_at;
      if (data.completed_at !== undefined) patch.completed_at = data.completed_at;
      if (data.message_id !== undefined) patch.message_id = data.message_id;

      const { data: result, error } = await this.client
        .from('agent_runs')
        .update(patch)
        .eq('id', runId)
        .select()
        .single();
      if (error) {
        if (error.code === 'PGRST116') throw new NotFoundError('AgentRun', runId);
        throw new DataAccessError(`Failed to update agent run: ${error.message}`, 'UPDATE_ERROR', error);
      }
      return mapRun(result);
    } catch (err) {
      if (err instanceof DataAccessError || err instanceof NotFoundError) throw err;
      throw new DataAccessError(`Unexpected error updating agent run: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async claimQueuedRuns(workerId: string, limit = 1): Promise<AgentRun[]> {
    try {
      const { data: queued, error } = await this.client
        .from('agent_runs')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) {
        throw new DataAccessError(`Failed to list queued agent runs: ${error.message}`, 'QUERY_ERROR', error);
      }
      if (!queued || queued.length === 0) return [];

      const claimed: AgentRun[] = [];
      const now = new Date().toISOString();
      for (const row of queued) {
        const { data: updated, error: updErr } = await this.client
          .from('agent_runs')
          .update({
            status: 'running',
            claimed_by: workerId,
            started_at: now,
            heartbeat_at: now,
            updated_at: now,
          })
          .eq('id', row.id)
          .eq('status', 'queued')
          .select()
          .maybeSingle();
        if (updErr) {
          console.warn(`[AgentRun] claim failed ${row.id}: ${updErr.message}`);
          continue;
        }
        if (updated) claimed.push(mapRun(updated));
      }
      return claimed;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error claiming agent runs: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async listActiveRunsByConversation(conversationId: string): Promise<AgentRun[]> {
    try {
      const { data, error } = await this.client
        .from('agent_runs')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['queued', 'running', 'waiting_task'])
        .order('created_at', { ascending: false });
      if (error) {
        throw new DataAccessError(`Failed to list active runs: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(mapRun);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error listing active runs: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async markStaleRunsFailed(staleBeforeIso: string, errorMsg: string): Promise<number> {
    try {
      const { data, error } = await this.client
        .from('agent_runs')
        .update({
          status: 'failed',
          error: errorMsg,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('status', ['running', 'waiting_task'])
        .lt('heartbeat_at', staleBeforeIso)
        .select('id');
      if (error) {
        throw new DataAccessError(`Failed to mark stale agent runs: ${error.message}`, 'UPDATE_ERROR', error);
      }
      return data?.length ?? 0;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error marking stale runs: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async appendEvent(data: AppendAgentRunEventDto): Promise<AgentRunEvent> {
    try {
      // seq 在 conversation 维度全局递增，供 SSE cursor 回放
      const maxSeq = await this.getMaxSeq(data.conversation_id);
      const seq = maxSeq + 1;
      const row = {
        run_id: data.run_id,
        conversation_id: data.conversation_id,
        seq,
        type: data.type,
        payload: data.payload ?? {},
        created_at: new Date().toISOString(),
      };
      const { data: result, error } = await this.client
        .from('agent_run_events')
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new DataAccessError(`Failed to append agent run event: ${error.message}`, 'CREATE_ERROR', error);
      }
      return mapEvent(result);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error appending agent run event: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async listEventsAfter(conversationId: string, afterSeq: number, limit = 500): Promise<AgentRunEvent[]> {
    try {
      const { data, error } = await this.client
        .from('agent_run_events')
        .select('*')
        .eq('conversation_id', conversationId)
        .gt('seq', afterSeq)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) {
        throw new DataAccessError(`Failed to list agent run events: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(mapEvent);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error listing agent run events: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async listEventsByRun(runId: string, afterSeq = 0): Promise<AgentRunEvent[]> {
    try {
      const { data, error } = await this.client
        .from('agent_run_events')
        .select('*')
        .eq('run_id', runId)
        .gt('seq', afterSeq)
        .order('seq', { ascending: true });
      if (error) {
        throw new DataAccessError(`Failed to list events by run: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(mapEvent);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error listing events by run: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async getMaxSeq(conversationId: string): Promise<number> {
    try {
      const { data, error } = await this.client
        .from('agent_run_events')
        .select('seq')
        .eq('conversation_id', conversationId)
        .order('seq', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new DataAccessError(`Failed to get max seq: ${error.message}`, 'QUERY_ERROR', error);
      }
      return data?.seq != null ? Number(data.seq) : 0;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error getting max seq: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async listQueuedRunIds(limit = 20): Promise<string[]> {
    try {
      const { data, error } = await this.client
        .from('agent_runs')
        .select('id')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) {
        throw new DataAccessError(`Failed to list queued run ids: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map((r) => r.id as string);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error listing queued run ids: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

  async getRunsByStatus(status: AgentRunStatus, limit = 50): Promise<AgentRun[]> {
    try {
      const { data, error } = await this.client
        .from('agent_runs')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) {
        throw new DataAccessError(`Failed to get runs by status: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(mapRun);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(`Unexpected error getting runs by status: ${err}`, 'UNEXPECTED_ERROR', err as Error);
    }
  }

}
