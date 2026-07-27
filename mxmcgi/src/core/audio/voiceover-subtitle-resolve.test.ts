import { describe, expect, it } from 'vitest';
import {
  extractObjectIdFromMediaUrl,
  extractTaskIdFromMediaUrl,
  normalizeVoiceoverMediaUrl,
  resolveStoredSubtitlesForAudio,
} from './voiceover-subtitle-resolve';
import type { Task } from '../../task/types';

describe('voiceover-subtitle-resolve url helpers', () => {
  it('extracts task id from gateway media URL', () => {
    expect(extractTaskIdFromMediaUrl('https://api.example.com/api/v1/media/audio/abc123')).toBe(
      'abc123'
    );
  });

  it('extracts object id from public object URL', () => {
    expect(extractObjectIdFromMediaUrl('https://api.example.com/api/v1/media/public/object/obj-1')).toBe(
      'obj-1'
    );
  });

  it('normalizes paths for comparison (api/v1 prefix optional)', () => {
    expect(normalizeVoiceoverMediaUrl('https://cdn.example.com/api/v1/media/audio/t1/')).toBe(
      '/media/audio/t1'
    );
    expect(normalizeVoiceoverMediaUrl('https://cdn.example.com/media/audio/t1')).toBe('/media/audio/t1');
  });
});

describe('resolveStoredSubtitlesForAudio', () => {
  it('matches TTS task by media URL path variants', async () => {
    const task: Task = {
      id: 'audio-task-1',
      type: 'audio',
      status: 'completed',
      result: {
        mediaUrls: ['https://old-host/api/v1/media/audio/audio-task-1'],
        metadata: {
          subtitle_data: {
            sentences: [{ text: 'TTS句', time_begin: 0, time_end: 2000 }],
          },
        },
      },
      metadata: {},
    } as Task;

    const getTask = async (taskId: string) =>
      taskId === 'audio-task-1' ? { task } : { task: null };

    const bundle = await resolveStoredSubtitlesForAudio({
      audioUrl: 'https://new-host/media/audio/audio-task-1',
      userId: 'user-1',
      getTask,
    });

    expect(bundle?.skippedAsrReason).toBe('tts_subtitles');
    expect(bundle?.fullText).toBe('TTS句');
  });

  it('reads MiniMax sentences from voiceover_subtitles_json param', async () => {
    const bundle = await resolveStoredSubtitlesForAudio({
      audioUrl: 'https://cdn.example.com/upload.mp3',
      params: {
        voiceover_subtitles_json: JSON.stringify({
          sentences: [{ text: '参数句', time_begin: 0, time_end: 1000 }],
        }),
      },
      getTask: async () => ({ task: null }),
    });

    expect(bundle?.skippedAsrReason).toBe('stored_subtitles');
    expect(bundle?.fullText).toBe('参数句');
  });
});
