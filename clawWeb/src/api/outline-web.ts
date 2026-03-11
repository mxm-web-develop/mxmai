import { request } from './client';

export interface OutlineTaskItem {
  id: string;
  type: string;
  status: string;
  progress?: { status: string; progress?: number; error?: string };
  result?: { metadata?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  requestParams?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface OutlineTaskListResponse {
  success?: boolean;
  data?: {
    tasks: OutlineTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

/**
 * 创建大纲任务
 */
export async function createOutline(
  body: Record<string, unknown>
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>('/api/v1/cgi/writing/outline', {
    method: 'POST',
    body,
  });
}

/**
 * 获取大纲任务列表
 */
export async function listOutlineTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data?: OutlineTaskListResponse; error?: string; status: number }> {
  const q = new URLSearchParams();
  q.set('type', 'writing');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  
  return request<OutlineTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

/**
 * 获取大纲任务详情
 */
export async function getOutlineTask(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}`);
}

/**
 * 获取大纲内容
 */
export async function getMediaOutline(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/writing/${encodeURIComponent(taskId)}`);
}