import { describe, expect, it } from 'vitest';
import { resolveScriptAudioMixInputs } from './concat-engine';
import type { VideoEditScript } from './types';

function scriptWithAudio(tracks: VideoEditScript['project']['timeline']['tracks']): VideoEditScript {
  return {
    version: '1.0.0',
    project: {
      id: 'p1',
      name: 't',
      createdAt: 0,
      modifiedAt: 0,
      settings: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        sampleRate: 48000,
        channels: 2,
      },
      mediaLibrary: { items: [] },
      timeline: {
        duration: 10,
        tracks,
        subtitles: [],
      },
    },
  };
}

describe('resolveScriptAudioMixInputs', () => {
  it('strips tts: and skips empty/muted tracks', () => {
    const script = scriptWithAudio([
      {
        id: 'track-video-main',
        type: 'video',
        name: 'v',
        clips: [],
        transitions: [],
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
      },
      {
        id: 'track-audio-main',
        type: 'audio',
        name: '口播',
        clips: [
          {
            id: 'clip-audio-main',
            trackId: 'track-audio-main',
            mediaId: 'tts:/api/v1/media/asset?bucket=aigc&key=a.mp3',
            startTime: 0,
            duration: 10,
            type: 'audio',
          },
        ],
        transitions: [],
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
      },
      {
        id: 'track-audio-bgm',
        type: 'audio',
        name: 'BGM',
        clips: [
          {
            id: 'clip-audio-bgm',
            trackId: 'track-audio-bgm',
            mediaId: '',
            startTime: 0,
            duration: 10,
            type: 'audio',
            volume: 0.35,
          } as never,
        ],
        transitions: [],
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
      },
      {
        id: 'track-audio-muted',
        type: 'audio',
        name: 'muted',
        clips: [
          {
            id: 'x',
            trackId: 'track-audio-muted',
            mediaId: 'https://example.com/x.mp3',
            startTime: 0,
            duration: 10,
            type: 'audio',
          },
        ],
        transitions: [],
        locked: false,
        hidden: false,
        muted: true,
        solo: false,
      },
    ]);

    expect(resolveScriptAudioMixInputs(script)).toEqual([
      { url: '/api/v1/media/asset?bucket=aigc&key=a.mp3', volume: 1 },
    ]);
  });
});
