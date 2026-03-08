/**
 * Supabase 敏感词数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { uid } from 'uid';
import type { ISensitiveWordRepository } from '../../interfaces/ISensitiveWordRepository';
import type {
  SensitiveWordList,
  SensitiveWord,
  SensitiveWordListBinding,
  CreateSensitiveWordListDto,
  UpdateSensitiveWordListDto,
  CreateSensitiveWordDto,
  CreateSensitiveWordListBindingDto,
} from '../../models/SensitiveWord';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function rowToList(r: any): SensitiveWordList {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    is_active: r.is_active ?? true,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToWord(r: any): SensitiveWord {
  return {
    id: r.id,
    list_id: r.list_id,
    word: r.word,
    created_at: r.created_at,
  };
}

function rowToBinding(r: any): SensitiveWordListBinding {
  return {
    id: r.id,
    scope: r.scope,
    type: r.type,
    subtype: r.subtype ?? null,
    list_id: r.list_id,
    sort_order: r.sort_order ?? 0,
    created_at: r.created_at,
  };
}

export class SupabaseSensitiveWordRepository implements ISensitiveWordRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async getWordsForSlot(scope: string, type: string, subtype?: string | null): Promise<string[]> {
    try {
      let bindingsQuery = this.client
        .from('sensitive_word_list_bindings')
        .select('list_id, sort_order')
        .eq('scope', scope)
        .eq('type', type)
        .order('sort_order', { ascending: true });

      if (subtype != null && subtype !== '') {
        bindingsQuery = bindingsQuery.eq('subtype', subtype);
      } else {
        bindingsQuery = bindingsQuery.is('subtype', null);
      }

      const { data: bindings, error: bindError } = await bindingsQuery;

      if (bindError) {
        throw new DataAccessError(`getWordsForSlot bindings: ${bindError.message}`, 'QUERY_ERROR', bindError);
      }
      if (!bindings || bindings.length === 0) {
        return [];
      }

      const listIds = bindings.map((b: any) => b.list_id);

      const { data: lists, error: listsError } = await this.client
        .from('sensitive_word_lists')
        .select('id')
        .in('id', listIds)
        .eq('is_active', true);

      if (listsError) {
        throw new DataAccessError(`getWordsForSlot lists: ${listsError.message}`, 'QUERY_ERROR', listsError);
      }
      const activeIds = new Set((lists ?? []).map((l: any) => l.id));
      const orderedListIds = listIds.filter((id: string) => activeIds.has(id));

      if (orderedListIds.length === 0) {
        return [];
      }

      const { data: words, error: wordsError } = await this.client
        .from('sensitive_words')
        .select('list_id, word')
        .in('list_id', orderedListIds);

      if (wordsError) {
        throw new DataAccessError(`getWordsForSlot words: ${wordsError.message}`, 'QUERY_ERROR', wordsError);
      }

      const seen = new Set<string>();
      const result: string[] = [];
      for (const listId of orderedListIds) {
        for (const row of words ?? []) {
          if (row.list_id !== listId) continue;
          const w = (row.word ?? '').trim();
          if (w && !seen.has(w)) {
            seen.add(w);
            result.push(w);
          }
        }
      }
      return result;
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`getWordsForSlot: ${e}`, 'UNEXPECTED_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async listLists(): Promise<SensitiveWordList[]> {
    const { data, error } = await this.client
      .from('sensitive_word_lists')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw new DataAccessError(`listLists: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map(rowToList);
  }

  async findListById(id: string): Promise<SensitiveWordList | null> {
    const { data, error } = await this.client
      .from('sensitive_word_lists')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new DataAccessError(`findListById: ${error.message}`, 'QUERY_ERROR', error);
    return data ? rowToList(data) : null;
  }

  async createList(dto: CreateSensitiveWordListDto): Promise<SensitiveWordList> {
    const id = dto.id ?? `swl_${uid(21)}`;
    const row = {
      id,
      name: dto.name,
      description: dto.description ?? null,
      is_active: dto.is_active ?? true,
    };
    const { data, error } = await this.client
      .from('sensitive_word_lists')
      .insert(row)
      .select()
      .single();
    if (error) throw new DataAccessError(`createList: ${error.message}`, 'INSERT_ERROR', error);
    return rowToList(data);
  }

  async updateList(id: string, dto: UpdateSensitiveWordListDto): Promise<SensitiveWordList> {
    const updates: any = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.is_active !== undefined) updates.is_active = dto.is_active;
    if (Object.keys(updates).length === 0) {
      const list = await this.findListById(id);
      if (!list) throw new DataAccessError(`List not found: ${id}`, 'NOT_FOUND');
      return list;
    }
    const { data, error } = await this.client
      .from('sensitive_word_lists')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new DataAccessError(`updateList: ${error.message}`, 'UPDATE_ERROR', error);
    return rowToList(data);
  }

  async deleteList(id: string): Promise<void> {
    const { error } = await this.client.from('sensitive_word_lists').delete().eq('id', id);
    if (error) throw new DataAccessError(`deleteList: ${error.message}`, 'DELETE_ERROR', error);
  }

  async listWordsByListId(listId: string): Promise<SensitiveWord[]> {
    const { data, error } = await this.client
      .from('sensitive_words')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: true });
    if (error) throw new DataAccessError(`listWordsByListId: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map(rowToWord);
  }

  async addWord(dto: CreateSensitiveWordDto): Promise<SensitiveWord> {
    const id = dto.id ?? `sw_${uid(21)}`;
    const row = { id, list_id: dto.list_id, word: dto.word.trim() };
    const { data, error } = await this.client
      .from('sensitive_words')
      .insert(row)
      .select()
      .single();
    if (error) throw new DataAccessError(`addWord: ${error.message}`, 'INSERT_ERROR', error);
    return rowToWord(data);
  }

  async deleteWord(id: string): Promise<void> {
    const { error } = await this.client.from('sensitive_words').delete().eq('id', id);
    if (error) throw new DataAccessError(`deleteWord: ${error.message}`, 'DELETE_ERROR', error);
  }

  async addWordsBatch(listId: string, words: string[]): Promise<number> {
    const trimmed = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
    if (trimmed.length === 0) return 0;
    const rows = trimmed.map((word) => ({ id: `sw_${uid(21)}`, list_id: listId, word }));
    const { error } = await this.client.from('sensitive_words').insert(rows);
    if (error) throw new DataAccessError(`addWordsBatch: ${error.message}`, 'INSERT_ERROR', error);
    return rows.length;
  }

  async listBindings(scope?: string, type?: string, subtype?: string | null): Promise<SensitiveWordListBinding[]> {
    let query = this.client.from('sensitive_word_list_bindings').select('*').order('scope').order('type').order('sort_order');
    if (scope != null) query = query.eq('scope', scope);
    if (type != null) query = query.eq('type', type);
    if (subtype !== undefined && subtype !== null && subtype !== '') {
      query = query.eq('subtype', subtype);
    } else if (subtype === null) {
      query = query.is('subtype', null);
    }
    const { data, error } = await query;
    if (error) throw new DataAccessError(`listBindings: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map(rowToBinding);
  }

  async addBinding(dto: CreateSensitiveWordListBindingDto): Promise<SensitiveWordListBinding> {
    const id = dto.id ?? `swlb_${uid(21)}`;
    const row = {
      id,
      scope: dto.scope,
      type: dto.type,
      subtype: dto.subtype ?? null,
      list_id: dto.list_id,
      sort_order: dto.sort_order ?? 0,
    };
    const { data, error } = await this.client
      .from('sensitive_word_list_bindings')
      .insert(row)
      .select()
      .single();
    if (error) throw new DataAccessError(`addBinding: ${error.message}`, 'INSERT_ERROR', error);
    return rowToBinding(data);
  }

  async removeBinding(id: string): Promise<void> {
    const { error } = await this.client.from('sensitive_word_list_bindings').delete().eq('id', id);
    if (error) throw new DataAccessError(`removeBinding: ${error.message}`, 'DELETE_ERROR', error);
  }

  async setBindingsForSlot(scope: string, type: string, subtype: string | null, listIds: string[]): Promise<void> {
    const sub = subtype ?? null;
    let deleteQuery = this.client
      .from('sensitive_word_list_bindings')
      .delete()
      .eq('scope', scope)
      .eq('type', type);
    if (sub === null) {
      deleteQuery = deleteQuery.is('subtype', null);
    } else {
      deleteQuery = deleteQuery.eq('subtype', sub);
    }
    const { error: delError } = await deleteQuery;
    if (delError) throw new DataAccessError(`setBindingsForSlot delete: ${delError.message}`, 'DELETE_ERROR', delError);

    for (let i = 0; i < listIds.length; i++) {
      await this.addBinding({ scope, type, subtype: sub, list_id: listIds[i], sort_order: i });
    }
  }
}
