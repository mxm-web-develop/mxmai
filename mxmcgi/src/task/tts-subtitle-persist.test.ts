import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  estimateSubtitlePlayerPayload,
  fetchSubtitleJsonFromUrl,
  hasPersistedSubtitle,
  persistTtsSubtitleInResult,
  pickSubtitleFileUrl,
  plainTtsScriptText,
  resolveVoiceoverScriptText,
} from './tts-subtitle-persist';
import type { Task, TaskResult } from './types';

describe('tts-subtitle-persist', () => {
  describe('pickSubtitleFileUrl', () => {
    it('reads direct subtitle_file', () => {
      expect(pickSubtitleFileUrl({ subtitle_file: ' https://cdn.example/s.json ' })).toBe(
        'https://cdn.example/s.json'
      );
    });

    it('reads nested raw.data.subtitle_file', () => {
      expect(
        pickSubtitleFileUrl({
          raw: { data: { subtitle_file: 'https://cdn.example/nested.json' } },
        })
      ).toBe('https://cdn.example/nested.json');
    });
  });

  describe('hasPersistedSubtitle', () => {
    it('requires non-empty subtitle_data rows', () => {
      expect(hasPersistedSubtitle({ subtitle_data: { sentences: [] } })).toBe(false);
      expect(
        hasPersistedSubtitle({
          subtitle_data: { sentences: [{ text: 'a', time_begin: 0, time_end: 1 }] },
        })
      ).toBe(true);
    });

    it('detects storage keys', () => {
      expect(
        hasPersistedSubtitle({
          subtitle_storage_bucket: 'gen',
          subtitle_storage_key: 'u/audio/t-subtitles.json',
        })
      ).toBe(true);
    });
  });

  describe('estimateSubtitlePlayerPayload', () => {
    it('strips TTS pause tags and splits by sentence', () => {
      expect(plainTtsScriptText('你好<#0.8#>世界')).toBe('你好 世界');
      const payload = estimateSubtitlePlayerPayload('第一句。第二句！', 10);
      expect(payload?.source).toBe('script_only');
      expect(payload?.sentences.length).toBeGreaterThanOrEqual(2);
      expect(payload?.sentences[0]?.time_begin).toBe(0);
      expect(payload?.sentences.at(-1)?.time_end).toBe(10000);
    });
  });

  describe('persistTtsSubtitleInResult', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ sentences: [{ text: '测试', time_begin: 0, time_end: 1200 }] }),
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('persists inline subtitle_data for audio tasks', async () => {
      const task = {
        id: 'task-audio-1',
        type: 'audio',
        metadata: { userId: 'user-1' },
      } as Task;
      const result: TaskResult = {
        mediaUrls: ['https://cdn.example/a.mp3'],
        metadata: { subtitle_file: 'https://minimax.example/sub.json' },
      };

      const next = await persistTtsSubtitleInResult(task, result);
      expect(next.metadata?.subtitle_data).toEqual({
        sentences: [{ text: '测试', time_begin: 0, time_end: 1200 }],
      });
      expect(next.metadata?.subtitle_file_upstream).toBe('https://minimax.example/sub.json');
      expect(next.metadata?.subtitle_file).toBeUndefined();
      expect(typeof next.metadata?.subtitle_persisted_at).toBe('string');
    });

    it('estimates script_only when speech model returns no subtitle_file', async () => {
      const task = {
        id: 'task-audio-2',
        type: 'audio',
        metadata: { userId: 'user-1' },
        requestParams: { prompt: '今天天气不错。适合出门走走。' },
      } as Task;
      const result: TaskResult = {
        mediaUrls: ['https://cdn.example/a.mp3'],
        metadata: { duration: 8, model: 'speech-2.8-hd' },
      };

      const next = await persistTtsSubtitleInResult(task, result);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(next.metadata?.subtitle_source).toBe('script_only');
      const data = next.metadata?.subtitle_data as {
        sentences: Array<{ text: string; time_begin: number; time_end: number }>;
      };
      expect(data.sentences.length).toBeGreaterThanOrEqual(2);
      expect(data.sentences[0]?.text).toContain('今天天气不错');
    });

    it('skips non-audio tasks', async () => {
      const task = { id: 't1', type: 'graph', metadata: {} } as Task;
      const result: TaskResult = {
        mediaUrls: [],
        metadata: { subtitle_file: 'https://minimax.example/sub.json' },
      };
      const next = await persistTtsSubtitleInResult(task, result);
      expect(next.metadata?.subtitle_data).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('resolveVoiceoverScriptText', () => {
    it('reads nested warp finalPrompt', () => {
      const task = {
        id: 't',
        type: 'audio',
        requestParams: {
          params: {
            businessPipelineState: { finalPrompt: '口播正文<#0.5#>第二句。' },
          },
        },
      } as Task;
      expect(resolveVoiceoverScriptText(task, {})).toBe('口播正文 第二句。');
    });
  });
});

describe('fetchSubtitleJsonFromUrl', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ sentences: [{ text: '你好', time_begin: 0, time_end: 1 }] }),
    }) as unknown as typeof fetch;

    const data = await fetchSubtitleJsonFromUrl('https://example.com/s.json');
    expect(data).toEqual({
      sentences: [{ text: '你好', time_begin: 0, time_end: 1 }],
    });
  });
});
