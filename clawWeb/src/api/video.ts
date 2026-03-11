import { request } from './client';

export interface VideoTaskResponse {
  taskId: string;
  status: string;
  createdAt: string;
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
): Promise<{ data?: VideoTaskResponse; error?: string; status: number }> {
  return request<VideoTaskResponse>(`/api/v1/cgi/video/${encodeURIComponent(modelName)}`, {
    method: 'POST',
    body: params,
  });
}

/**
 * 获取视频任务结果
 */
export async function getMediaVideo(taskId: string): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/video/${encodeURIComponent(taskId)}`);
}