import { describe, expect, it } from 'vitest';
import {
  enrichVoiceoverTimeline,
  parseMinioDirectObjectUrl,
  resolveMediaUrl,
  resolveVoiceoverEnrichInput,
  rewriteInternalStorageMediaUrl,
} from './voiceoverTimelineEnrich';
import type { VideoEditScript } from './types';

const baseScript: VideoEditScript = {
  version: '1.0.0',
  project: {
    id: 'p1',
    name: 'test',
    settings: { width: 1920, height: 1080, frameRate: 30 },
    timeline: {
      duration: 12,
      tracks: [
        {
          type: 'video',
          name: 'V1',
          clips: [
            {
              id: 'clip-vis',
              startTime: 0,
              duration: 12,
              metadata: { mxmRenderMode: 'gsap-html-animation' },
            },
          ],
        },
      ],
      subtitles: [],
    },
  },
};

describe('voiceoverTimelineEnrich', () => {
  it('adds audio and subtitle tracks when missing', () => {
    const enriched = enrichVoiceoverTimeline(baseScript, {
      audioUrl: 'https://cdn.example.com/vo.mp3',
      subtitles: [
        { text: '欢迎收听', startSeconds: 0, endSeconds: 2.5 },
        { text: '本期科普', startSeconds: 2.5, endSeconds: 5 },
      ],
    });

    const audioTrack = enriched.project.timeline.tracks.find(
      (t) => t.type === 'audio' && t.name === '语音'
    );
    expect(audioTrack?.clips[0]?.mediaId).toBe('tts:https://cdn.example.com/vo.mp3');
    expect(enriched.project.timeline.tracks.filter((t) => t.type === 'audio')).toHaveLength(2);
    expect(enriched.project.timeline.subtitles).toHaveLength(2);
  });

  it('does not duplicate when tracks already exist', () => {
    const withAudio: VideoEditScript = {
      ...baseScript,
      project: {
        ...baseScript.project,
        timeline: {
          ...baseScript.project.timeline,
          tracks: [
            ...baseScript.project.timeline.tracks,
            {
              id: 'track-audio',
              type: 'audio',
              name: '口播',
              clips: [{ id: 'a1', startTime: 0, duration: 12, mediaId: 'tts:https://x.mp3' }],
            },
          ],
          subtitles: [{ id: 's1', text: '已有', startTime: 0, endTime: 3 }],
        },
      },
    };

    const enriched = enrichVoiceoverTimeline(withAudio, {
      audioUrl: 'https://cdn.example.com/other.mp3',
      subtitles: [{ text: '新', startSeconds: 0, endSeconds: 1 }],
    });

    expect(enriched.project.timeline.tracks.filter((t) => t.type === 'audio')).toHaveLength(2);
    expect(enriched.project.timeline.subtitles).toHaveLength(1);
  });

  it('resolves enrich input from task requestParams', () => {
    const input = resolveVoiceoverEnrichInput({
      requestParams: {
        voiceover_audio_url: 'https://cdn.example.com/a.mp3',
        voiceover_subtitles_json: JSON.stringify({
          segments: [{ text: 'hi', startSeconds: 0, endSeconds: 1 }],
        }),
      },
    });
    expect(input.audioUrl).toContain('a.mp3');
    expect(input.subtitles).toHaveLength(1);
  });

  it('rewrites internal MinIO URL to gateway media asset path', () => {
    const raw =
      'http://127.0.0.1:9000/aigc/8ee5db88-b157-4ce5-ab98-fcf7f2880f3b/audio/1783330664325-8rseed.mp3';
    expect(parseMinioDirectObjectUrl(raw)).toEqual({
      bucket: 'aigc',
      key: '8ee5db88-b157-4ce5-ab98-fcf7f2880f3b/audio/1783330664325-8rseed.mp3',
    });
    const rewritten = rewriteInternalStorageMediaUrl(raw);
    expect(rewritten).toContain('/api/v1/media/asset?');
    expect(rewritten).toContain('bucket=aigc');
    expect(resolveMediaUrl(`tts:${raw}`)).toBe(rewritten);
  });

  it('rewrites private IP MinIO :9000 URL', () => {
    const raw = 'http://10.0.0.8:9000/generated/user-1/video-edit/clip-a.mp4';
    expect(parseMinioDirectObjectUrl(raw)).toEqual({
      bucket: 'generated',
      key: 'user-1/video-edit/clip-a.mp4',
    });
    expect(rewriteInternalStorageMediaUrl(raw)).toContain('/api/v1/media/asset?');
  });
});
