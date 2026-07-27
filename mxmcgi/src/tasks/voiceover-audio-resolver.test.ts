import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: { search: vi.fn() },
}));

vi.mock('../core/video-edit/audio-probe', () => ({
  probeVoiceoverAudioDurationSeconds: vi.fn().mockResolvedValue(62.5),
}));

const getTaskMock = vi.fn();
vi.mock('../task/task-executor', () => ({
  taskExecutor: {
    getTaskManager: () => ({
      getTask: (...args: unknown[]) => getTaskMock(...args),
    }),
  },
}));

import { runResolveVoiceoverAudioStep } from './voiceover-audio-resolver';
import type { TaskContext } from './types';
import type { Task } from '../task/types';

describe('runResolveVoiceoverAudioStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTaskMock.mockReset();
  });

  it('探测口播 URL 并写入 params/state', async () => {
    const ctx = {
      params: { voiceover_audio_url: 'https://cdn.example.com/vo.mp3' },
      state: {},
    } as unknown as TaskContext;

    const next = await runResolveVoiceoverAudioStep(ctx, {
      step: 'resolveVoiceoverAudio',
      params: {},
    });

    expect(next.params.audio_duration_seconds).toBe(62.5);
    expect(next.state.voiceoverAudio).toMatchObject({
      url: 'https://cdn.example.com/vo.mp3',
      durationSeconds: 62.5,
    });
  });

  it('引入音频任务上已持久化的 TTS 字幕', async () => {
    getTaskMock.mockResolvedValue({
      task: {
        id: 'audio-task-1',
        type: 'audio',
        status: 'completed',
        result: {
          mediaUrls: ['https://cdn/a.mp3'],
          metadata: {
            subtitle_data: {
              sentences: [{ text: '持久化句', time_begin: 0, time_end: 1500 }],
            },
          },
        },
        metadata: {},
      } as Task,
    });

    const ctx = {
      params: {
        voiceover_audio_url: 'https://cdn.example.com/vo.mp3',
        voiceover_source_task_id: 'audio-task-1',
      },
      state: {},
      userId: 'u1',
    } as unknown as TaskContext;

    const next = await runResolveVoiceoverAudioStep(ctx, {
      step: 'resolveVoiceoverAudio',
      params: {},
    });

    expect(getTaskMock).toHaveBeenCalledWith('audio-task-1');
    expect(next.params.script).toBe('持久化句');
    expect(String(next.params.voiceover_subtitles_json)).toContain('持久化句');
    expect(next.state.voiceoverAsrMeta).toMatchObject({
      skipped: true,
      reason: 'tts_subtitles',
      source: 'tts',
      attachedAt: 'resolveVoiceoverAudio',
    });
  });

  it('将内网 MinIO 直链规范为 Gateway 媒体路径', async () => {
    const minio =
      'http://127.0.0.1:9000/aigc/user-1/audio/sample.mp3';
    const ctx = {
      params: { voiceover_audio_url: minio },
      state: {},
    } as unknown as TaskContext;

    const next = await runResolveVoiceoverAudioStep(ctx, {
      step: 'resolveVoiceoverAudio',
      params: {},
    });

    expect(next.params.voiceover_audio_url).toContain('/api/v1/media/asset?');
    expect(next.state.voiceoverAudio).toMatchObject({
      url: expect.stringContaining('/api/v1/media/asset?'),
    });
  });

  it('缺少 URL 时抛错', async () => {
    const ctx = { params: {}, state: {} } as unknown as TaskContext;
    await expect(
      runResolveVoiceoverAudioStep(ctx, { step: 'resolveVoiceoverAudio', params: {} })
    ).rejects.toThrow(/缺少口播音频 URL/);
  });
});
