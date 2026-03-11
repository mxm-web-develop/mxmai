import { request } from './client';

export interface WritingTaskItem {
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

export interface WritingTaskListResponse {
  success?: boolean;
  data?: {
    tasks: WritingTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

/**
 * 创建写作任务
 */
export async function createWriting(
  body: Record<string, unknown>
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>('/api/v1/cgi/writing', {
    method: 'POST',
    body,
  });
}

/**
 * 获取写作任务列表
 */
export async function listWritingTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data?: WritingTaskListResponse; error?: string; status: number }> {
  const q = new URLSearchParams();
  q.set('type', 'writing');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  
  return request<WritingTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

/**
 * 获取任务详情
 */
export async function getTask(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}`);
}

/**
 * 删除任务
 */
export async function deleteTask(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}

/**
 * 获取写作内容
 */
export async function getMediaWriting(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/writing/${encodeURIComponent(taskId)}`);
}