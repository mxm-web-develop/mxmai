import { request } from './client';

export interface GraphTaskItem {
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

export interface GraphTaskListResponse {
  success?: boolean;
  data?: {
    tasks: GraphTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

/**
 * 获取图片任务列表
 */
export async function listGraphTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data?: GraphTaskListResponse; error?: string; status: number }> {
  const q = new URLSearchParams();
  q.set('type', 'graph');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  
  return request<GraphTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

/**
 * 获取图片模型列表
 */
export async function getGraphModels(): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>('/api/v1/cgi/graph/models');
}

/**
 * 提交图片生成任务
 */
export async function createGraphTask(
  modelName: string,
  params: Record<string, any>
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/cgi/graph/${encodeURIComponent(modelName)}`, {
    method: 'POST',
    body: params,
  });
}

/**
 * 获取图片任务结果
 */
export async function getMediaGraph(
  taskId: string
): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/graph/${encodeURIComponent(taskId)}`);
}

/**
 * 获取图片表单选项
 */
export async function getGraphFormOptions(
  graphType: string,
  type?: string,
  lang: 'zh' | 'en' = 'zh'
): Promise<{ data?: any; error?: string; status: number }> {
  const params: Record<string, any> = {
    [graphType]: '',
    lang,
  };
  if (type) {
    params.type = type;
  }
  return request<any>('/api/v1/cgi/graph/getformOptions', { params });
}