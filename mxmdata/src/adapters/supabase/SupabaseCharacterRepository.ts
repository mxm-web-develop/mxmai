/**
 * Supabase 角色数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ICharacterRepository,
  Character,
  CreateCharacterDto,
  UpdateCharacterDto,
  CharacterListOptions,
} from '../../interfaces/ICharacterRepository';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseCharacterRepository implements ICharacterRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async create(dto: CreateCharacterDto): Promise<Character> {
    try {
      // 验证图片数组长度（最多10张）
      const appearanceImages = dto.appearance?.reference_images || [];
      if (appearanceImages.length > 10) {
        throw new DataAccessError('外表参考图片最多支持10张', 'VALIDATION_ERROR');
      }
      
      const clothingStyleImages = dto.clothing_style?.reference_images || [];
      if (clothingStyleImages.length > 10) {
        throw new DataAccessError('服装风格参考图片最多支持10张', 'VALIDATION_ERROR');
      }

      const { data, error } = await this.client
        .from('characters')
        .insert({
          user_id: dto.user_id,
          name: dto.name,
          nickname: dto.nickname,
          age: dto.age,
          category: dto.category || [],
          tags: dto.tags || [],
          is_public: dto.is_public ?? false,
          appearance_description: dto.appearance?.description,
          appearance_reference_images: appearanceImages,
          voice_description: dto.voice?.description,
          voice_clone_voice_id: dto.voice?.clone_voiceId,
          voice_example_url: dto.voice?.voice_example,
          reference_videos: dto.reference_videos || [],
          clothing_style_description: dto.clothing_style?.description,
          clothing_style_reference_images: clothingStyleImages,
          others: dto.others || {},
          relations: dto.relations || {},
        })
        .select('id,user_id,name,nickname,age,category,tags,is_public,appearance_description,appearance_reference_images,voice_description,voice_clone_voice_id,voice_example_url,reference_videos,clothing_style_description,clothing_style_reference_images,others,relations,created_at,updated_at')
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create character: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create character: no data returned', 'CREATE_ERROR');
      }

      const mapped = this.mapToCharacter(data);
      // 确保返回的对象只包含 Character 接口定义的字段
      return mapped;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating character: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findById(id: string): Promise<Character | null> {
    try {
      const { data, error } = await this.client
        .from('characters')
        .select('id,user_id,name,nickname,age,category,tags,is_public,appearance_description,appearance_reference_images,voice_description,voice_clone_voice_id,voice_example_url,reference_videos,clothing_style_description,clothing_style_reference_images,others,relations,created_at,updated_at')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find character by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToCharacter(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding character by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findAll(options?: CharacterListOptions): Promise<{ characters: Character[]; total: number }> {
    try {
      const filters = options?.filters || {};
      const pagination = options?.pagination;
      const sort = options?.sort || { field: 'created_at', order: 'desc' };

      let query = this.client.from('characters').select('id,user_id,name,nickname,age,category,tags,is_public,appearance_description,appearance_reference_images,voice_description,voice_clone_voice_id,voice_example_url,reference_videos,clothing_style_description,clothing_style_reference_images,others,created_at,updated_at', { count: 'exact' });

      // 应用筛选条件
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }
      if (filters.name) {
        query = query.ilike('name', `%${filters.name}%`);
      }
      if (filters.category && filters.category.length > 0) {
        query = query.overlaps('category', filters.category);
      }
      if (filters.is_public !== undefined) {
        query = query.eq('is_public', filters.is_public);
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,nickname.ilike.%${filters.search}%`);
      }
      if (filters.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      // 应用排序
      query = query.order(sort.field, { ascending: sort.order === 'asc' });

      // 应用分页
      if (pagination) {
        const offset = (pagination.page - 1) * pagination.limit;
        query = query.range(offset, offset + pagination.limit - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        // 如果表不存在（schema cache未更新），返回空数组而不是抛出错误
        if (error.message && error.message.includes('Could not find the table')) {
          console.warn('[SupabaseCharacterRepository] Table "characters" not found in schema cache, returning empty array. Please restart Supabase PostgREST service.');
          return {
            characters: [],
            total: 0,
          };
        }
        throw new DataAccessError(`Failed to find characters: ${error.message}`, 'QUERY_ERROR', error);
      }

      return {
        characters: (data || []).map((item) => this.mapToCharacter(item)),
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding characters: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findByUserId(userId: string, options?: Omit<CharacterListOptions, 'filters'>): Promise<Character[]> {
    try {
      const result = await this.findAll({
        ...options,
        filters: { user_id: userId },
      });
      return result.characters;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding characters by user id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async update(id: string, dto: UpdateCharacterDto): Promise<Character> {
    try {
      const updateData: Record<string, any> = {};
      
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.nickname !== undefined) updateData.nickname = dto.nickname;
      if (dto.age !== undefined) updateData.age = dto.age;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.tags !== undefined) updateData.tags = dto.tags;
      if (dto.is_public !== undefined) updateData.is_public = dto.is_public;
      
      // 外表（appearance）
      if (dto.appearance !== undefined) {
        if (dto.appearance.description !== undefined) {
          updateData.appearance_description = dto.appearance.description;
        }
        if (dto.appearance.reference_images !== undefined) {
          if (dto.appearance.reference_images.length > 10) {
            throw new DataAccessError('外表参考图片最多支持10张', 'VALIDATION_ERROR');
          }
          updateData.appearance_reference_images = dto.appearance.reference_images;
        }
      }
      
      // 声音（voice）
      if (dto.voice !== undefined) {
        if (dto.voice.description !== undefined) {
          updateData.voice_description = dto.voice.description;
        }
        if (dto.voice.clone_voiceId !== undefined) {
          updateData.voice_clone_voice_id = dto.voice.clone_voiceId;
        }
        if (dto.voice.voice_example !== undefined) {
          updateData.voice_example_url = dto.voice.voice_example;
        }
      }
      
      // 参考视频（reference_videos）
      if (dto.reference_videos !== undefined) {
        updateData.reference_videos = dto.reference_videos;
      }
      
      // 服装风格（clothing_style）
      if (dto.clothing_style !== undefined) {
        if (dto.clothing_style.description !== undefined) {
          updateData.clothing_style_description = dto.clothing_style.description;
        }
        if (dto.clothing_style.reference_images !== undefined) {
          if (dto.clothing_style.reference_images.length > 10) {
            throw new DataAccessError('服装风格参考图片最多支持10张', 'VALIDATION_ERROR');
          }
          updateData.clothing_style_reference_images = dto.clothing_style.reference_images;
        }
      }
      
      // 其他信息（others）
      if (dto.others !== undefined) {
        // 如果只更新部分字段，需要先获取当前值，然后合并
        const current = await this.findById(id);
        if (!current) {
          throw new NotFoundError('Character', id);
        }
        updateData.others = { ...current.others, ...dto.others };
      }
      
      // 角色关系（relations）
      if (dto.relations !== undefined) {
        updateData.relations = dto.relations;
      }
      
      updateData.updated_at = new Date().toISOString();

      const { data: updatedData, error } = await this.client
        .from('characters')
        .update(updateData)
        .eq('id', id)
        .select('id,user_id,name,nickname,age,category,tags,is_public,appearance_description,appearance_reference_images,voice_description,voice_clone_voice_id,voice_example_url,reference_videos,clothing_style_description,clothing_style_reference_images,others,relations,created_at,updated_at')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Character', id);
        }
        throw new DataAccessError(`Failed to update character: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updatedData) {
        throw new NotFoundError('Character', id);
      }

      return this.mapToCharacter(updatedData);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating character: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('characters')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(`Failed to delete character: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error deleting character: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async incrementUsage(id: string): Promise<void> {
    // 新结构中没有usage_count字段，此方法保留接口兼容性但不执行任何操作
    // 或者可以移除这个方法，但为了接口兼容性暂时保留
    return Promise.resolve();
  }

  /**
   * 将数据库记录映射为 Character 对象
   */
  private mapToCharacter(data: any): Character {
    // 按照 test.md 的结构返回，不包含系统字段（user_id, created_at, updated_at）
    // 不包含 has_profile_images, has_profile_audio, has_profile_video（前端可以通过数据结构判断）
    const character: Character = {
      id: data.id,
      name: data.name,
      nickname: data.nickname || undefined,
      age: data.age || undefined,
      category: data.category || [],
      tags: data.tags || [],
      is_public: data.is_public ?? false,
      appearance: {
        description: data.appearance_description || undefined,
        reference_images: data.appearance_reference_images || [],
      },
      voice: {
        description: data.voice_description || undefined,
        clone_voiceId: data.voice_clone_voice_id || undefined,
        voice_example: data.voice_example_url || undefined,
      },
      reference_videos: data.reference_videos || [],
      clothing_style: {
        description: data.clothing_style_description || undefined,
        reference_images: data.clothing_style_reference_images || [],
      },
      others: data.others || {},
      relations: data.relations || undefined,
    };
    return character;
  }
}
