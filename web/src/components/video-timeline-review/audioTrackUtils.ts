import type { TimelineClip, TimelineTrack, VideoEditScript } from './types';
import { BGM_AUDIO_TRACK_ID, VOICE_AUDIO_TRACK_ID } from './types';

export type AudioRole = 'voice' | 'bgm';

export const DEFAULT_VOICE_VOLUME = 1;
export const DEFAULT_BGM_VOLUME = 0.35;
export const DEFAULT_FADE_IN = 0;
export const DEFAULT_FADE_OUT = 0;

export function resolveAudioRole(track: TimelineTrack): AudioRole | null {
  if (track.type !== 'audio') return null;
  const id = (track.id ?? '').toLowerCase();
  const name = (track.name ?? '').trim();
  if (id.includes('bgm') || name.includes('背景音乐')) return 'bgm';
  if (
    id.includes('voice') ||
    id.includes('voiceover') ||
    name === '语音' ||
    name === '口播' ||
    name.includes('语音')
  ) {
    return 'voice';
  }
  return 'voice';
}

export function findAudioTrack(script: VideoEditScript | null, role: AudioRole): TimelineTrack | undefined {
  if (!script) return undefined;
  return script.project.timeline.tracks.find((t) => resolveAudioRole(t) === role);
}

export function getClipAudioSettings(
  clip?: TimelineClip | null,
  track?: TimelineTrack | null,
  role: AudioRole = 'voice'
): {
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
} {
  const defaultVolume = role === 'bgm' ? DEFAULT_BGM_VOLUME : DEFAULT_VOICE_VOLUME;
  return {
    volume: typeof clip?.volume === 'number' ? clip.volume : defaultVolume,
    muted: track?.muted === true,
    fadeIn: clip?.fade?.fadeIn ?? DEFAULT_FADE_IN,
    fadeOut: clip?.fade?.fadeOut ?? DEFAULT_FADE_OUT,
  };
}

/** 确保存在空的背景音乐轨（占位 clip，便于音量配置与选曲） */
export function ensureBgmTrack(script: VideoEditScript): VideoEditScript {
  const next = structuredClone(script) as VideoEditScript;
  const timeline = next.project.timeline;
  if (!timeline.tracks) timeline.tracks = [];

  let bgmTrack = timeline.tracks.find((t) => resolveAudioRole(t) === 'bgm');
  const duration = Math.max(timeline.duration, 0.01);

  if (!bgmTrack) {
    bgmTrack = {
      id: BGM_AUDIO_TRACK_ID,
      type: 'audio',
      name: '背景音乐',
      clips: [],
    };
    timeline.tracks.push(bgmTrack);
  }

  if (!bgmTrack.clips?.length) {
    bgmTrack.clips = [
      {
        id: 'clip-audio-bgm',
        trackId: bgmTrack.id ?? BGM_AUDIO_TRACK_ID,
        startTime: 0,
        duration,
        type: 'audio',
        volume: DEFAULT_BGM_VOLUME,
        fade: { fadeIn: 1, fadeOut: 2 },
      },
    ];
  }

  return next;
}

/** 将旧脚本中的「口播」轨名规范为「语音」 */
export function normalizeVoiceTrackLabels(script: VideoEditScript): VideoEditScript {
  const next = structuredClone(script) as VideoEditScript;
  for (const track of next.project.timeline.tracks) {
    if (track.type !== 'audio') continue;
    if (resolveAudioRole(track) !== 'voice') continue;
    if (track.name === '口播' || !track.name) track.name = '语音';
    if (!track.id) track.id = VOICE_AUDIO_TRACK_ID;
  }
  return next;
}
