import { request } from './client';

/**
 * 角色数据结构
 */
export interface Character {
  id: string;
  user_id: string;
  name: string;
  nickname?: string;
  description?: string;
  category?: string[];
  tags?: string[];
  appearance?: {
    description?: string;
    reference_images?: string[];
  };
  voice?: {
    voice_id?: string;
    voice_example?: string;
  };
  personality?: Record<string, any>;
  background?: Record<string, any>;
  clothing_style?: {
    description?: string;
    reference_images?: string[];
  };
  reference_videos?: string[];
  is_public?: boolean;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
  others?: {
    personality?: string;
    [key: string]: any;
  };
}

export interface CharacterListResponse {
  characters: Character[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateCharacterRequest {
  name: string;
  nickname?: string;
  description?: string;
  category?: string[];
  tags?: string[];
  appearance?: {
    description?: string;
    reference_images?: string[];
  };
  voice?: {
    voice_id?: string;
    voice_example?: string;
  };
  personality?: Record<string, any>;
  background?: Record<string, any>;
  clothing_style?: {
    description?: string;
    reference_images?: string[];
  };
  reference_videos?: string[];
  is_public?: boolean;
}

export interface UpdateCharacterRequest extends Partial<CreateCharacterRequest> {}

/**
 * 获取角色列表
 */
export async function listCharacters(
  options?: {
    category?: string[];
    tags?: string[];
    search?: string;
    is_public?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<{ data?: CharacterListResponse; error?: string; status: number }> {
  const params: Record<string, any> = {};
  
  if (options?.category && options.category.length > 0) {
    params.category = options.category;
  }
  if (options?.tags && options.tags.length > 0) {
    params.tags = options.tags;
  }
  if (options?.search) {
    params.search = options.search;
  }
  if (options?.is_public !== undefined) {
    params.is_public = String(options.is_public);
  }
  if (options?.page) {
    params.page = String(options.page);
  }
  if (options?.limit) {
    params.limit = String(options.limit);
  }
  
  return request<CharacterListResponse>('/api/v1/characters', { params });
}

/**
 * 获取角色详情
 */
export async function getCharacter(id: string): Promise<{ data?: Character; error?: string; status: number }> {
  return request<Character>(`/api/v1/characters/${id}`);
}

/**
 * 创建角色
 */
export async function createCharacter(
  data: CreateCharacterRequest
): Promise<{ data?: Character; error?: string; status: number }> {
  return request<Character>('/api/v1/characters', {
    method: 'POST',
    body: data,
  });
}

/**
 * 更新角色
 */
export async function updateCharacter(
  id: string,
  data: UpdateCharacterRequest
): Promise<{ data?: Character; error?: string; status: number }> {
  return request<Character>(`/api/v1/characters/${id}`, {
    method: 'PUT',
    body: data,
  });
}

/**
 * 删除角色
 */
export async function deleteCharacter(id: string): Promise<{ data?: void; error?: string; status: number }> {
  return request<void>(`/api/v1/characters/${id}`, {
    method: 'DELETE',
  });
}

/**
 * 关联图片任务到角色
 */
export async function linkImageTask(
  characterId: string,
  taskId: string,
  imageType: 'appearance' | 'clothing_style' = 'appearance'
): Promise<{ data?: Character; error?: string; status: number }> {
  return request<Character>(`/api/v1/characters/${characterId}/link-image-task`, {
    method: 'POST',
    body: { taskId, imageType },
  });
}

/**
 * 关联音频任务到角色
 */
export async function linkAudioTask(
  characterId: string,
  taskId: string,
  cloneVoiceId?: string
): Promise<{ data?: Character; error?: string; status: number }> {
  return request<Character>(`/api/v1/characters/${characterId}/link-audio-task`, {
    method: 'POST',
    body: { taskId, cloneVoiceId },
  });
}

/**
 * 从写作任务保存角色到用户角色库
 */
export async function saveCharactersFromWriting(
  writingTaskId: string,
  characters?: Array<{
    id?: string;
    name: string;
    nickname?: string;
    age?: string;
    appearance?: string;
    voice_description?: string;
    clothing_style?: string;
    personality?: string;
    others?: string;
    category?: string[];
    tags?: string[];
  }>
): Promise<{ data?: Character[]; error?: string; status: number }> {
  return request<Character[]>('/api/v1/characters/save-from-writing', {
    method: 'POST',
    body: {
      writingTaskId,
      ...(Array.isArray(characters) && characters.length > 0 ? { characters } : {}),
    },
  });
}

/**
 * 从大纲保存角色到用户角色库
 */
export async function saveCharactersFromOutline(
  characters: Array<{
    id?: string;
    name: string;
    nickname?: string;
    age?: string;
    appearance?: string;
    voice_description?: string;
    clothing_style?: string;
    personality?: string;
    others?: string;
    category?: string[];
    tags?: string[];
  }>,
  outlineTaskId?: string
): Promise<{ data?: Character[]; error?: string; status: number }> {
  return request<Character[]>('/api/v1/characters/save-from-outline', {
    method: 'POST',
    body: { characters, outlineTaskId },
  });
}

/**
 * 生成角色（使用 LLM）
 */
export async function generateCharacters(
  params: { count: number; prompt: string }
): Promise<{ data?: Array<{
  id: string;
  name: string;
  nickname?: string;
  age?: string;
  appearance?: string;
  voice_description?: string;
  clothing_style?: string;
  personality?: string;
  others?: string;
  category?: string[];
  tags?: string[];
  relations?: {
    [characterId: string]: {
      [otherCharacterId: string]: string;
    };
  };
}>; error?: string; status: number }> {
  return request<Array<{
    id: string;
    name: string;
    nickname?: string;
    age?: string;
    appearance?: string;
    voice_description?: string;
    clothing_style?: string;
    personality?: string;
    others?: string;
    category?: string[];
    tags?: string[];
    relations?: {
      [characterId: string]: {
        [otherCharacterId: string]: string;
      };
    };
  }>>('/api/v1/characters/generate', {
    method: 'POST',
    body: params,
  });
}