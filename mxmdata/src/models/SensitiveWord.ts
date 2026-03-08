/**
 * 敏感词相关数据模型（系统化提示词工程 - Admin 可配置）
 */

export interface SensitiveWordList {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SensitiveWord {
  id: string;
  list_id: string;
  word: string;
  created_at: string;
}

export interface SensitiveWordListBinding {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
  list_id: string;
  sort_order: number;
  created_at: string;
}

export interface CreateSensitiveWordListDto {
  id?: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export interface UpdateSensitiveWordListDto {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CreateSensitiveWordDto {
  id?: string;
  list_id: string;
  word: string;
}

export interface CreateSensitiveWordListBindingDto {
  id?: string;
  scope: string;
  type: string;
  subtype?: string | null;
  list_id: string;
  sort_order?: number;
}
