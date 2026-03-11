import { request } from './client';

export type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TaskProgress {
  status: TaskStatus;
  progress?: number;
  error?: string;
  logs?: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface TaskResultStorageInfo {
  keys: string[];
  bucket: string;
  urls: string[];
}

export interface TaskResult {
  mediaUrls?: string[];
  storageInfo?: TaskResultStorageInfo;
  metadata?: Record<string, any>;
}

export interface TaskMetadata {
  model: string;
  provider: string;
  userId?: string;
  [key: string]: any;
}

export type TaskType = 'writing' | 'image' | 'graph' | 'graph-grid9-parent' | 'video' | 'video-batch-parent' | 'audio' | 'other';

export interface CgiTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: TaskProgress;
  result?: TaskResult;
  metadata: TaskMetadata;
  createdAt: string;
  updatedAt: string;
  requestParams: Record<string, any>;
}

export interface CgiTaskListResponse {
  tasks: CgiTask[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * 获取图片生成任务列表
 */
export async function listImageTasks(
  options?: { status?: TaskStatus; model?: string; limit?: number; offset?: number }
): Promise<{ data?: CgiTaskListResponse; error?: string; status: number }> {
  const { status, model, limit = 100, offset = 0 } = options || {};

  return request<CgiTaskListResponse>('/api/v1/cgi-tasks', {
    params: {
      type: 'image',
      status,
      model,
      limit,
      offset,
    },
  });
}

/**
 * 获取音频生成任务列表
 */
export async function listAudioTasks(
  options?: { status?: TaskStatus; model?: string; limit?: number; offset?: number }
): Promise<{ data?: CgiTaskListResponse; error?: string; status: number }> {
  const { status, model, limit = 100, offset = 0 } = options || {};

  return request<CgiTaskListResponse>('/api/v1/cgi-tasks', {
    params: {
      type: 'audio',
      status,
      model,
      limit,
      offset,
    },
  });
}

/**
 * 获取视频生成任务列表
 */
export async function listVideoTasks(
  options?: { status?: TaskStatus; model?: string; limit?: number; offset?: number; startDate?: string; endDate?: string }
): Promise<{ data?: CgiTaskListResponse; error?: string; status: number }> {
  const { status, model, limit = 100, offset = 0, startDate, endDate } = options || {};

  return request<CgiTaskListResponse>('/api/v1/cgi-tasks', {
    params: {
      type: 'video',
      status,
      model,
      limit,
      offset,
      startDate,
      endDate,
    },
  });
}

/**
 * 获取写作生成任务列表
 */
export async function listWritingTasks(
  options?: { status?: TaskStatus; model?: string; limit?: number; offset?: number }
): Promise<{ data?: CgiTaskListResponse; error?: string; status: number }> {
  const { status, model, limit = 100, offset = 0 } = options || {};

  return request<CgiTaskListResponse>('/api/v1/cgi-tasks', {
    params: {
      type: 'writing',
      status,
      model,
      limit,
      offset,
    },
  });
}

/**
 * 获取任务详情
 */
export async function getTask(taskId: string): Promise<{ data?: CgiTask; error?: string; status: number }> {
  return request<CgiTask>(`/api/v1/cgi-tasks/${taskId}`);
}

/**
 * 重试失败的任务
 */
export async function retryTask(taskId: string): Promise<{ data?: { taskId: string }; error?: string; status: number }> {
  return request<{ taskId: string }>(`/api/v1/cgi-tasks/${taskId}/retry`, {
    method: 'GET',
  });
}

/**
 * 删除任务
 */
export async function deleteTask(taskId: string): Promise<{ data?: void; error?: string; status: number }> {
  return request<void>(`/api/v1/cgi-tasks/${taskId}`, {
    method: 'DELETE',
  });
}