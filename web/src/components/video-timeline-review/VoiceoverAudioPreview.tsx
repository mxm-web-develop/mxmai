import { useVoiceoverPlaybackUrl } from './useVoiceoverPlaybackUrl';

type VoiceoverAudioPreviewProps = {
  sourceUrl?: string;
};

/** 口播试听：不展示原始地址，走 Gateway / blob 播放 */
export function VoiceoverAudioPreview({ sourceUrl }: VoiceoverAudioPreviewProps) {
  const { playbackUrl, isLoading } = useVoiceoverPlaybackUrl(sourceUrl);

  if (!sourceUrl) return null;

  return (
    <div className="video-timeline-review__audio-preview">
      {playbackUrl ? (
        <audio controls preload="metadata" src={playbackUrl} style={{ width: '100%' }} />
      ) : (
        <p className="video-timeline-review__hint" style={{ margin: 0 }}>
          {isLoading ? '音频加载中…' : '音频加载失败'}
        </p>
      )}
    </div>
  );
}
