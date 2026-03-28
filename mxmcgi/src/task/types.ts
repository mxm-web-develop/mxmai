/**
 * 任务系统类型定义
 * 用于统一管理异步生成任务
 */

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  /**
   * 网络或上游状态查询异常（如 DeerAPI 500 / 网络断开）
   * - 与业务失败区分开，便于用户手动恢复或重试
   * - 任务恢复服务不会主动对该状态做二次恢复
   */
  | 'network_error';

export type TaskType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'writing'
  | 'outline'
  | 'graph'
  | 'graph-grid9-parent'
  | 'video-batch-parent'
  | 'other';

export interface TaskMetadata {
  model: string;
  provider: string;
  userId?: string;
  /** 用于前端显示的任务名称（可由用户输入/自动生成） */
  label?: string;
  [key: string]: any;
}

export interface TaskProgress {
  status: TaskStatus;
  progress?: number; // 0-100
  logs?: string[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskResult {
  // 结果格式：base64 或 minio URL
  mediaUrls: string[];
  // 如果存储到 minio，包含存储信息
  storageInfo?: {
    keys: string[];
    bucket: string;
    urls: string[];
  };
  metadata?: Record<string, any>;
}

/**
 * 任务实体
 */
export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: TaskProgress;
  result?: TaskResult;
  metadata: TaskMetadata;
  createdAt: Date;
  updatedAt: Date;
  // 原始请求参数（用于重试等）
  requestParams: Record<string, any>;
}

/**
 * 创建任务请求
 */
export interface CreateTaskRequest {
  type: TaskType;
  model: string;
  provider?: string;
  params: Record<string, any>;
  userId?: string;
  /**
   * 幂等键：用于避免用户重复提交创建出重复任务
   * - 建议由客户端传入（如 Header: Idempotency-Key 或 params.metadata.idempotencyKey）
   * - 服务端会将其写入任务 metadata，并在创建前尝试复用已有任务
   */
  idempotencyKey?: string;
  // 是否存储到 minio（默认 false，返回 base64）
  storeToMinio?: boolean;
  // MinIO 存储配置（如果 storeToMinio 为 true）
  storageConfig?: {
    bucket?: string;
    pathTemplate?: string;
  };
}

/**
 * 创建任务响应
 */
export interface CreateTaskResponse {
  taskId: string;
  status: TaskStatus;
  createdAt: Date;
}

/**
 * 查询任务响应
 */
export interface GetTaskResponse {
  task: Task;
}

/**
 * 任务列表查询参数
 */
export interface ListTasksParams {
  userId?: string;
  type?: TaskType;
  status?: TaskStatus;
  model?: string;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean; // 是否包含已软删除的任务（仅 admin 使用）
  startDate?: Date | string; // 开始时间（可选，用于时间范围查询）
  endDate?: Date | string; // 结束时间（可选，用于时间范围查询）
}

/**
 * 任务列表响应
 */
export interface ListTasksResponse {
  tasks: Task[];
  total: number; // 符合条件的任务总数（不受分页限制）
  count: number; // 当前分页返回的任务数量
  limit: number;
  offset: number;
}
