/**
 * CGI Task 数据模型
 * 用于管理 mxmcgi 的异步生成任务
 */

export type CGITaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type CGITaskType = 'text' | 'image' | 'video' | 'audio' | 'graph' | 'graph-grid9-parent' | 'video-batch-parent';
export type CGITaskResultFormat = 'base64' | 'minio';

export interface CGITask {
  id: string;
  user_id: string;
  task_type: CGITaskType;
  model_name: string;
  model_provider?: string;
  status: CGITaskStatus;
  progress: number; // 0-100
  error_message?: string;
  input_data: Record<string, any>;
  prompt?: string;
  output_data?: Record<string, any>;
  result_format: CGITaskResultFormat;
  storage_info?: {
    keys: string[];
    bucket: string;
    urls: string[];
  };
  queued_at?: Date | string;
  started_at?: Date | string;
  completed_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at?: Date | string;             // 软删除标记（用户删除时设置）
  metadata?: Record<string, any>;
}

export interface CreateCGITaskDto {
  id?: string; // 可选，如果不提供则使用 uid 生成
  user_id: string;
  task_type: CGITaskType;
  model_name: string;
  model_provider?: string;
  input_data: Record<string, any>;
  prompt?: string;
  result_format?: CGITaskResultFormat; // 默认 'base64'
  storage_config?: {
    bucket?: string;
    path_template?: string;
  };
  metadata?: Record<string, any>;
}

export interface UpdateCGITaskDto {
  task_type?: CGITaskType; // 支持更新任务类型（用于九宫格父任务转换）
  status?: CGITaskStatus;
  progress?: number;
  error_message?: string;
  output_data?: Record<string, any>;
  storage_info?: {
    keys: string[];
    bucket: string;
    urls: string[];
  };
  queued_at?: Date | string;
  started_at?: Date | string;
  completed_at?: Date | string;
  metadata?: Record<string, any>;
}

export interface ListCGITasksOptions {
  user_id?: string;
  task_type?: CGITaskType;
  status?: CGITaskStatus;
  model_name?: string;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean; // 是否包含已软删除的任务（仅 admin 使用）
  startDate?: Date | string; // 开始时间（可选，用于时间范围查询）
  endDate?: Date | string; // 结束时间（可选，用于时间范围查询）
}
