import { request } from './client';

export interface AudioTaskItem {
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

export interface AudioTaskListResponse {
  success?: boolean;
  data?: {
    tasks: AudioTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

/**
 * 获取音频任务列表
 */
export async function listAudioTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data?: AudioTaskListResponse; error?: string; status: number }> {
  const q = new URLSearchParams();
  q.set('type', 'audio');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  
  return request<AudioTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

/**
 * 获取音频模型列表
 */
export async function getAudioModels(): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>('/api/v1/cgi/audio/models');
}

/**
 * 提交音频生成任务
 */
export async function createAudioTask(
  modelName: string,
  params: Record<string, any>
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/cgi/audio/${encodeURIComponent(modelName)}`, {
    method: 'POST',
    body: params,
  });
}

/**
 * 获取音频任务结果
 */
export async function getMediaAudio(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/audio/${encodeURIComponent(taskId)}`);
}