import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Download, Pause, Play, RotateCcw } from 'lucide-react';
import { AudioWaveVisualizer } from './AudioWaveVisualizer';

gsap.registerPlugin(useGSAP);

type ThemeAudioPlayerProps = {
  src: string;
  onTimeUpdate?: (currentTimeSec: number) => void;
  onEnded?: () => void;
  onDownload?: () => void;
  downloadBusy?: boolean;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ThemeAudioPlayer({
  src,
  onTimeUpdate,
  onEnded,
  onDownload,
  downloadBusy,
}: ThemeAudioPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [seeking, setSeeking] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  useGSAP(
    () => {
      if (!playBtnRef.current) return;
      gsap.fromTo(
        playBtnRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.6)' }
      );
    },
    { scope: rootRef, dependencies: [src] }
  );

  useGSAP(
    () => {
      const ring = rootRef.current?.querySelector('.theme-audio-player__pulse');
      if (!ring || !playing) {
        if (ring) gsap.killTweensOf(ring);
        return;
      }
      gsap.fromTo(
        ring,
        { scale: 1, opacity: 0.55 },
        { scale: 1.65, opacity: 0, duration: 1.4, repeat: -1, ease: 'power2.out' }
      );
    },
    { scope: rootRef, dependencies: [playing], revertOnUpdate: true }
  );

  const syncTime = (t: number) => {
    setCurrent(t);
    onTimeUpdate?.(t);
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
        setPlaying(true);
        gsap.to(playBtnRef.current, { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1 });
      } catch {
        setPlaying(false);
      }
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const handleSeek = (ratio: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(duration) || duration <= 0) return;
    const next = Math.max(0, Math.min(duration, ratio * duration));
    el.currentTime = next;
    syncTime(next);
  };

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div className="theme-audio-player" ref={rootRef}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          if (seeking) return;
          syncTime(e.currentTarget.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
      />

      <AudioWaveVisualizer playing={playing} progress={progress} />

      <div className="theme-audio-player__glass">
        <div className="theme-audio-player__row">
          <div className="theme-audio-player__play-wrap">
            <span className="theme-audio-player__pulse" aria-hidden />
            <button
              ref={playBtnRef}
              type="button"
              className={`theme-audio-player__play${playing ? ' is-playing' : ''}`}
              onClick={() => void togglePlay()}
              aria-label={playing ? '暂停' : '播放'}
            >
              {playing ? <Pause size={22} /> : <Play size={22} className="theme-audio-player__play-icon" />}
            </button>
          </div>

          <div className="theme-audio-player__track">
            <div className="theme-audio-player__range-wrap">
              <div className="theme-audio-player__range-fill" style={{ width: `${progress * 100}%` }} />
              <input
                type="range"
                className="theme-audio-player__range"
                min={0}
                max={1000}
                value={Math.round(progress * 1000)}
                aria-label="播放进度"
                onChange={(e) => {
                  setSeeking(true);
                  handleSeek(Number(e.target.value) / 1000);
                }}
                onMouseUp={() => setSeeking(false)}
                onTouchEnd={() => setSeeking(false)}
              />
            </div>
            <div className="theme-audio-player__times">
              <span>{formatTime(current)}</span>
              <span className="theme-audio-player__times-sep">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="theme-audio-player__actions">
            <button
              type="button"
              className="theme-audio-player__icon-btn"
              onClick={() => {
                const el = audioRef.current;
                if (!el) return;
                el.currentTime = 0;
                syncTime(0);
                void el.play();
              }}
              aria-label="重新播放"
              title="重新播放"
            >
              <RotateCcw size={16} />
            </button>

            {onDownload ? (
              <button
                type="button"
                className="theme-audio-player__download"
                onClick={onDownload}
                disabled={downloadBusy}
                title="下载音频"
              >
                <Download size={16} />
                <span>{downloadBusy ? '下载中…' : '下载'}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
