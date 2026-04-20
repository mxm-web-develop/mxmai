/**
 * Smartflow 仓库 - 管理 Smartflow 定义
 */

import { Smartflow, CreateSmartflowDto, UpdateSmartflowDto } from '../models/types';
import { getSupabaseClient } from '@mxmai/mxmdata';

export interface ISmartflowRepository {
  findById(id: string): Promise<Smartflow | null>;
  findAll(limit?: number, offset?: number): Promise<Smartflow[]>;
  findPublic(limit?: number, offset?: number): Promise<Smartflow[]>;
  findByUserId(userId: string, limit?: number, offset?: number): Promise<Smartflow[]>;
  create(data: CreateSmartflowDto): Promise<Smartflow>;
  update(id: string, data: UpdateSmartflowDto): Promise<Smartflow>;
  delete(id: string): Promise<void>;
}

/**
 * 内存实现的 Smartflow 仓库
 */
export class InMemorySmartflowRepository implements ISmartflowRepository {
  private smartflows: Map<string, Smartflow> = new Map();

  async findById(id: string): Promise<Smartflow | null> {
    return this.smartflows.get(id) || null;
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<Smartflow[]> {
    const all = Array.from(this.smartflows.values());
    return all.slice(offset, offset + limit);
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<Smartflow[]> {
    const publicOnes = Array.from(this.smartflows.values()).filter(s => s.is_public);
    return publicOnes.slice(offset, offset + limit);
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<Smartflow[]> {
    const userOnes = Array.from(this.smartflows.values()).filter(s => s.author_id === userId);
    return userOnes.slice(offset, offset + limit);
  }

  async create(data: CreateSmartflowDto): Promise<Smartflow> {
    const now = new Date().toISOString();
    const smartflow: Smartflow = {
      id: data.id || `sf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      description: data.description,
      category: data.category,
      icon: data.icon,
      tags: data.tags || [],
      schema: data.schema,
      status: data.status || 'draft',
      version: data.version || '1.0.0',
      author_id: data.author_id,
      is_public: data.is_public || false,
      created_at: now,
      updated_at: now,
    };
    this.smartflows.set(smartflow.id, smartflow);
    return smartflow;
  }

  async update(id: string, data: UpdateSmartflowDto): Promise<Smartflow> {
    const existing = this.smartflows.get(id);
    if (!existing) {
      throw new Error(`Smartflow not found: ${id}`);
    }
    const updated: Smartflow = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
    };
    this.smartflows.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.smartflows.delete(id);
  }
}

/**
 * Supabase 持久化实现的 Smartflow 仓库
 */
export class SupabaseSmartflowRepository implements ISmartflowRepository {
  private supabase = getSupabaseClient();

  async findById(id: string): Promise<Smartflow | null> {
    const { data, error } = await this.supabase.from('smartflows').select('*').eq('id', id).single();
    if (error) {
      // PGRST116: The result contains 0 rows
      if ((error as any).code === 'PGRST116') return null;
      throw new Error(`Failed to find smartflow: ${error.message}`);
    }
    return (data as unknown as Smartflow) ?? null;
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<Smartflow[]> {
    const { data, error } = await this.supabase
      .from('smartflows')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to list smartflows: ${error.message}`);
    return (data as unknown as Smartflow[]) ?? [];
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<Smartflow[]> {
    const { data, error } = await this.supabase
      .from('smartflows')
      .select('*')
      .eq('is_public', true)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to list public smartflows: ${error.message}`);
    return (data as unknown as Smartflow[]) ?? [];
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<Smartflow[]> {
    const { data, error } = await this.supabase
      .from('smartflows')
      .select('*')
      .eq('author_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to list smartflows by user: ${error.message}`);
    return (data as unknown as Smartflow[]) ?? [];
  }

  async create(data: CreateSmartflowDto): Promise<Smartflow> {
    const now = new Date().toISOString();
    const payload = {
      id: data.id || `sf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: data.name,
      description: data.description ?? null,
      category: data.category ?? null,
      icon: data.icon ?? null,
      tags: data.tags ?? [],
      schema: data.schema,
      status: data.status ?? 'draft',
      version: data.version ?? '1.0.0',
      author_id: data.author_id ?? null,
      is_public: data.is_public ?? false,
      created_at: now,
      updated_at: now,
    };
    const { data: created, error } = await this.supabase.from('smartflows').insert(payload).select('*').single();
    if (error) throw new Error(`Failed to create smartflow: ${error.message}`);
    return created as unknown as Smartflow;
  }

  async update(id: string, data: UpdateSmartflowDto): Promise<Smartflow> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description ?? null;
    if (data.category !== undefined) updateData.category = data.category ?? null;
    if (data.icon !== undefined) updateData.icon = data.icon ?? null;
    if (data.tags !== undefined) updateData.tags = data.tags ?? [];
    if (data.schema !== undefined) updateData.schema = data.schema;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.version !== undefined) updateData.version = data.version;
    const { data: updated, error } = await this.supabase
      .from('smartflows')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      if ((error as any).code === 'PGRST116') throw new Error(`Smartflow not found: ${id}`);
      throw new Error(`Failed to update smartflow: ${error.message}`);
    }
    return updated as unknown as Smartflow;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('smartflows').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete smartflow: ${error.message}`);
  }
}

// 默认仓库实例
export const smartflowRepository = new SupabaseSmartflowRepository();
