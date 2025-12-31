/**
 * 文件存储仓库接口
 * 提供文件上传、下载、删除等操作
 */

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  expiresIn?: number; // 预签名URL过期时间（秒）
}

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  presignedUrl?: string; // 预签名URL（如果启用）
}

export interface FileMetadata {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  lastModified: Date | string;
  metadata?: Record<string, string>;
}

export interface ListFilesOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListFilesResult {
  files: FileMetadata[];
  continuationToken?: string;
  hasMore: boolean;
}

/**
 * 文件存储仓库接口
 */
export interface IStorageRepository {
  /**
   * 上传文件
   * @param bucket 存储桶名称
   * @param key 文件键（路径）
   * @param file 文件内容（Buffer）
   * @param options 上传选项
   */
  uploadFile(
    bucket: string,
    key: string,
    file: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult>;

  /**
   * 下载文件
   * @param bucket 存储桶名称
   * @param key 文件键（路径）
   */
  downloadFile(bucket: string, key: string): Promise<Buffer>;

  /**
   * 删除文件
   * @param bucket 存储桶名称
   * @param key 文件键（路径）
   */
  deleteFile(bucket: string, key: string): Promise<void>;

  /**
   * 获取文件元数据
   * @param bucket 存储桶名称
   * @param key 文件键（路径）
   */
  getFileMetadata(bucket: string, key: string): Promise<FileMetadata | null>;

  /**
   * 生成预签名URL（用于临时访问）
   * @param bucket 存储桶名称
   * @param key 文件键（路径）
   * @param expiresIn 过期时间（秒），默认7天
   */
  getPresignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;

  /**
   * 检查文件是否存在
   * @param bucket 存储桶名称
   * @param key 文件键（路径）
   */
  fileExists(bucket: string, key: string): Promise<boolean>;

  /**
   * 列出文件
   * @param bucket 存储桶名称
   * @param options 列表选项
   */
  listFiles(bucket: string, options?: ListFilesOptions): Promise<ListFilesResult>;

  /**
   * 复制文件
   * @param sourceBucket 源存储桶
   * @param sourceKey 源文件键
   * @param targetBucket 目标存储桶
   * @param targetKey 目标文件键
   */
  copyFile(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string
  ): Promise<void>;
}

