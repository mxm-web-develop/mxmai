import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchSubtitleJsonFromUrl,
  hasPersistedSubtitle,
  persistTtsSubtitleInResult,
  pickSubtitleFileUrl,
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
    it('detects inline subtitle_data', () => {
      expect(hasPersistedSubtitle({ subtitle_data: { sentences: [] } })).toBe(true);
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
});
