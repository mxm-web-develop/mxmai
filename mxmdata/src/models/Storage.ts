/**
 * 存储数据模型
 * 与 IStorageRepository 接口中的类型定义保持一致
 */

import type {
  UploadOptions,
  UploadResult,
  FileMetadata,
  ListFilesOptions,
  ListFilesResult,
} from '../interfaces/IStorageRepository';

export type {
  UploadOptions,
  UploadResult,
  FileMetadata,
  ListFilesOptions,
  ListFilesResult,
};

/**
 * 文件上传请求
 */
export interface FileUploadRequest {
  bucket: string;
  key: string;
  file: Buffer;
  options?: UploadOptions;
}

/**
 * 文件下载请求
 */
export interface FileDownloadRequest {
  bucket: string;
  key: string;
}

/**
 * 文件删除请求
 */
export interface FileDeleteRequest {
  bucket: string;
  key: string;
}

