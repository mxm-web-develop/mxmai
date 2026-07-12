import { useMediaPlaybackUrl, type MediaPlaybackState } from './useMediaPlaybackUrl';

export type VoiceoverPlaybackState = MediaPlaybackState;

/** 时间轴口播预览：鉴权 /media/* 走 ?token= 直链，audio 可 Range 边下边播 */
export function useVoiceoverPlaybackUrl(sourceUrl?: string): VoiceoverPlaybackState {
  return useMediaPlaybackUrl(sourceUrl, { delivery: 'stream' });
}
