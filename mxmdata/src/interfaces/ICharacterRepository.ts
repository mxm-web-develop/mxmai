/**
 * 角色数据仓库接口
 * 提供角色基础数据的 CRUD 操作
 */

export interface Character {
  id: string;
  name: string;
  nickname?: string;
  age?: number;
  category?: string[];  // 分类数组
  tags?: string[];
  is_public: boolean;   // 是否公开（只对admin账号开放）
  
  // 外表（appearance）
  appearance: {
    description?: string;
    reference_images?: string[];  // 参考图片URL数组（最多10张）
  };
  
  // 声音（voice）
  voice: {
    description?: string;
    clone_voiceId?: string;  // Minimax克隆声音ID
    voice_example?: string;  // 声音示例URL
  };
  
  // 参考视频（reference_videos）
  reference_videos?: string[];  // 参考视频URL数组
  
  // 服装风格（clothing_style）
  clothing_style: {
    description?: string;
    reference_images?: string[];  // 参考图片URL数组（最多10张）
  };
  
  // 其他信息（others）
  others: {
    personality?: string;
    [key: string]: any;  // 其他自定义字段
  };
  
  // 角色关系（relations）
  // 格式：{ [characterId]: { [otherCharacterId]: relation } }
  // 例如：{ "char1": { "char2": "情侣" }, "char2": { "char1": "情侣" } }
  relations?: {
    [characterId: string]: {
      [otherCharacterId: string]: string;  // 关系描述，如 "情侣"、"父子"、"朋友"等
    };
  };
}

export interface CreateCharacterDto {
  user_id: string;  // 系统字段，从JWT token自动获取
  name: string;
  nickname?: string;
  age?: number;
  category?: string[];
  tags?: string[];
  is_public?: boolean;  // 只对admin账号开放
  appearance?: {
    description?: string;
    reference_images?: string[];  // 最多10张
  };
  voice?: {
    description?: string;
    clone_voiceId?: string;
    voice_example?: string;
  };
  reference_videos?: string[];  // 参考视频URL数组
  clothing_style?: {
    description?: string;
    reference_images?: string[];  // 最多10张
  };
  others?: {
    personality?: string;
    [key: string]: any;
  };
  relations?: {
    [characterId: string]: {
      [otherCharacterId: string]: string;
    };
  };
}

export interface UpdateCharacterDto {
  name?: string;
  nickname?: string;
  age?: number;
  category?: string[];
  tags?: string[];
  is_public?: boolean;  // 只对admin账号开放
  appearance?: {
    description?: string;
    reference_images?: string[];  // 最多10张
  };
  voice?: {
    description?: string;
    clone_voiceId?: string;
    voice_example?: string;
  };
  reference_videos?: string[];  // 参考视频URL数组
  clothing_style?: {
    description?: string;
    reference_images?: string[];  // 最多10张
  };
  others?: {
    personality?: string;
    [key: string]: any;
  };
  relations?: {
    [characterId: string]: {
      [otherCharacterId: string]: string;
    };
  };
}

export interface CharacterFilters {
  user_id?: string;
  name?: string;
  category?: string[];
  tags?: string[];
  is_public?: boolean;
  search?: string; // 全文搜索（name, nickname）
}

export interface CharacterListOptions {
  filters?: CharacterFilters;
  pagination?: {
    page: number;
    limit: number;
  };
  sort?: {
    field: 'created_at' | 'updated_at' | 'name';
    order: 'asc' | 'desc';
  };
}

/**
 * 角色数据仓库接口
 */
export interface ICharacterRepository {
  /**
   * 创建角色
   */
  create(dto: CreateCharacterDto): Promise<Character>;

  /**
   * 根据 ID 查找角色
   */
  findById(id: string): Promise<Character | null>;

  /**
   * 查询角色列表
   */
  findAll(options?: CharacterListOptions): Promise<{ characters: Character[]; total: number }>;

  /**
   * 根据用户ID查找角色列表
   */
  findByUserId(userId: string, options?: Omit<CharacterListOptions, 'filters'>): Promise<Character[]>;

  /**
   * 更新角色
   */
  update(id: string, dto: UpdateCharacterDto): Promise<Character>;

  /**
   * 删除角色
   */
  delete(id: string): Promise<void>;

  /**
   * 增加使用次数
   */
  incrementUsage(id: string): Promise<void>;
}
