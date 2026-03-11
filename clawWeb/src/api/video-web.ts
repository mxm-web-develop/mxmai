import { request } from './client';

export interface VideoTaskItem {
  id: string;
  type: string;
  status: string;
  progress?: { status: string; progress?: number; error?: string };
  result?: { 
    mediaUrls?: string[];
    storageInfo?: { keys: string[]; bucket: string; urls: string[] };
    metadata?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  requestParams?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface VideoTaskListResponse {
  success?: boolean;
  data?: {
    tasks: VideoTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

/**
 * 获取视频任务列表
 */
export async function listVideoTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data?: VideoTaskListResponse; error?: string; status: number }> {
  const q = new URLSearchParams();
  q.set('type', 'video');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  
  return request<VideoTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

/**
 * 获取视频模型列表
 */
export async function getVideoModels(): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>('/api/v1/cgi/video/models');
}

/**
 * 提交视频生成任务
 */
export async function createVideoTask(
  modelName: string,
  params: Record<string, any>
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/cgi/video/${encodeURIComponent(modelName)}`, {
    method: 'POST',
    body: params,
  });
}

/**
 * 获取视频任务结果
 */
export async function getMediaVideo(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/video/${encodeURIComponent(taskId)}`);
}