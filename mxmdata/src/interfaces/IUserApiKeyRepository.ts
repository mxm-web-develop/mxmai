/**
 * 用户 API Key（个人访问凭证）仓库
 * 仅存 key_hash，明文创建时仅返回一次
 */

export interface CreateUserApiKeyDto {
  userId: string;
  keyHash: string;
  keyPrefix: string;
  name?: string | null;
  expiresAt?: Date | string | null;
}

/** 入库后的完整记录（含 id、时间）；Gateway 校验用 */
export interface UserApiKeyRecord {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

/** 按 hash 查到的记录（用于认证），不含 key_hash 亦可，这里含 id/user_id 等 */
export interface UserApiKeyByHash {
  id: string;
  user_id: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

/** 列表项（不包含 key_hash） */
export interface UserApiKeyListItem {
  id: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface IUserApiKeyRepository {
  create(data: CreateUserApiKeyDto): Promise<UserApiKeyRecord>;

  findByKeyHash(keyHash: string): Promise<UserApiKeyByHash | null>;

  listByUserId(userId: string): Promise<UserApiKeyListItem[]>;

  delete(id: string, userId: string): Promise<boolean>;

  updateLastUsedAt(id: string): Promise<void>;
}
