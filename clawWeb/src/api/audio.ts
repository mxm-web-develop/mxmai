import { request } from './client';

export interface AudioTaskResponse {
  taskId: string;
  status: string;
  createdAt: string;
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
): Promise<{ data?: AudioTaskResponse; error?: string; status: number }> {
  return request<AudioTaskResponse>(`/api/v1/cgi/audio/${encodeURIComponent(modelName)}`, {
    method: 'POST',
    body: params,
  });
}

/**
 * 获取音频任务结果
 */
export async function getMediaAudio(taskId: string): Promise<{ data?: any; error?: string; status: number }> {
  return request<any>(`/api/v1/media/audio/${encodeURIComponent(taskId)}`);
}