import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: { search: vi.fn() },
}));

import { runTranscribeVoiceoverAudioStep } from './voiceover-asr-step';
import type { TaskContext } from '../tasks/types';
import type { Task } from '../task/types';

const getTaskMock = vi.fn();

vi.mock('../../task/task-executor', () => ({
  taskExecutor: {
    getTaskManager: () => ({
      getTask: (...args: unknown[]) => getTaskMock(...args),
    }),
  },
}));

vi.mock('./asr-service', () => ({
  transcribeAudioFromUrl: vi.fn().mockResolvedValue({
    source: 'asr',
    fullText: '识别文本',
    segments: [{ text: '识别文本', startSeconds: 0, endSeconds: 2 }],
  }),
}));

import { transcribeAudioFromUrl } from './asr-service';

describe('runTranscribeVoiceoverAudioStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTaskMock.mockReset();
  });

  it('skips ASR when MiniMax TTS subtitles exist on source task', async () => {
    const task: Task = {
      id: 'audio-task-1',
      type: 'audio',
      status: 'completed',
      result: {
        mediaUrls: ['https://cdn/a.mp3'],
        metadata: {
          subtitle_data: {
            sentences: [{ text: 'TTS句', time_begin: 0, time_end: 2000 }],
          },
        },
      },
      metadata: {},
    } as Task;

    getTaskMock.mockResolvedValue({ task });

    const ctx = {
      params: { voiceover_audio_url: 'https://api.example.com/api/v1/media/audio/audio-task-1' },
      state: {},
    } as unknown as TaskContext;

    const next = await runTranscribeVoiceoverAudioStep(ctx, {
      step: 'transcribeVoiceoverAudio',
      params: { skipWhenTtsSubtitles: true },
    });

    expect(transcribeAudioFromUrl).not.toHaveBeenCalled();
    expect(next.params.script).toBe('TTS句');
    expect(next.state.voiceoverAsrMeta).toMatchObject({
      skipped: true,
      reason: 'tts_subtitles',
      source: 'tts',
    });
  });

  it('runs ASR for uploaded audio without subtitles', async () => {
    const ctx = {
      params: { voiceover_audio_url: 'https://cdn.example.com/upload.mp3' },
      state: {},
    } as unknown as TaskContext;

    const next = await runTranscribeVoiceoverAudioStep(ctx, {
      step: 'transcribeVoiceoverAudio',
      params: {},
    });

    expect(transcribeAudioFromUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/upload.mp3',
      expect.objectContaining({ language: 'zh' })
    );
    expect(next.params.script).toBe('识别文本');
    expect(next.state.voiceoverAsrMeta).toMatchObject({ source: 'asr', reason: 'asr' });
  });

  it('skips ASR when user script is present', async () => {
    const ctx = {
      params: {
        voiceover_audio_url: 'https://cdn.example.com/upload.mp3',
        script: '用户已写口播稿。',
        audio_duration_seconds: 8,
      },
      state: {},
    } as unknown as TaskContext;

    const next = await runTranscribeVoiceoverAudioStep(ctx, {
      step: 'transcribeVoiceoverAudio',
      params: { skipWhenScriptPresent: true },
    });

    expect(transcribeAudioFromUrl).not.toHaveBeenCalled();
    expect(next.state.voiceoverAsrMeta).toMatchObject({
      skipped: true,
      reason: 'user_script',
    });
  });
});
