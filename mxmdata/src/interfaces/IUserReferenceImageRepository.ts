/**
 * 用户参考图记录仓库接口
 */

export interface UserReferenceImage {
  id: string;
  user_id: string;
  r2_bucket: string;
  r2_key: string;
  r2_url: string;
  original_name: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  tag: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface CreateUserReferenceImageDto {
  user_id: string;
  r2_bucket: string;
  r2_key: string;
  r2_url: string;
  original_name?: string | null;
  content_type?: string | null;
  file_size_bytes?: number | null;
  tag?: string | null;
}

export interface IUserReferenceImageRepository {
  /** 按 ID 查找 */
  findById(id: string): Promise<UserReferenceImage | null>;

  /** 按 ID + 用户查找（排除已软删） */
  findByIdForUser(id: string, userId: string): Promise<UserReferenceImage | null>;

  /** 列出用户最近的参考图（排除已删除） */
  listByUser(userId: string, options?: { limit?: number; offset?: number }): Promise<{ items: UserReferenceImage[]; total: number }>;

  /** 记录一次上传 */
  create(dto: CreateUserReferenceImageDto): Promise<UserReferenceImage>;

  /** 软删除记录 */
  softDelete(id: string, userId: string): Promise<void>;

  /** 清理 N 天前的记录（物理删除） */
  cleanup(daysOld: number): Promise<number>;
}
