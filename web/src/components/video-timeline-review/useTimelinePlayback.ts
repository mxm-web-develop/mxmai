import { useCallback, useEffect, useRef, useState } from 'react';

function clampTime(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, time));
}

export function formatTimelineTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins > 0) {
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }
  return `${secs.toFixed(1)}s`;
}

export type TimelineAudioMix = {
  voiceUrl?: string;
  voiceVolume?: number;
  voiceMuted?: boolean;
  bgmUrl?: string;
  bgmVolume?: number;
  bgmMuted?: boolean;
};

function applyAudioElementMix(
  el: HTMLAudioElement | null,
  volume: number,
  muted: boolean
) {
  if (!el) return;
  el.muted = muted;
  el.volume = Math.max(0, Math.min(1, volume));
}

/**
 * 时间轴播放：虚拟时钟驱动 currentTime，语音与背景音乐并行混播。
 */
export function useTimelinePlayback(duration: number, mix: TimelineAudioMix = {}) {
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const currentTimeRef = useRef(0);
  const lastUiPublishRef = useRef(0);
  const prevVoiceUrlRef = useRef<string | undefined>();
  const prevBgmUrlRef = useRef<string | undefined>();
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const effectiveDuration = Math.max(duration, 0.01);
  const voiceUrl = mix.voiceUrl;
  const bgmUrl = mix.bgmUrl;
  const voiceVolume = mix.voiceVolume ?? 1;
  const bgmVolume = mix.bgmVolume ?? 0.35;
  const voiceMuted = mix.voiceMuted ?? false;
  const bgmMuted = mix.bgmMuted ?? false;
  const hasAudio = Boolean(voiceUrl || bgmUrl);

  currentTimeRef.current = currentTime;

  const stopVirtualLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const pause = useCallback(() => {
    voiceRef.current?.pause();
    bgmRef.current?.pause();
    stopVirtualLoop();
    setIsPlaying(false);
  }, [stopVirtualLoop]);

  const syncAudioTime = useCallback(
    (time: number) => {
      for (const el of [voiceRef.current, bgmRef.current]) {
        if (!el || !el.src) continue;
        try {
          el.currentTime = time;
        } catch {
          /* ignore seek errors while metadata loading */
        }
      }
    },
    []
  );

  const seek = useCallback(
    (time: number) => {
      const next = clampTime(time, effectiveDuration);
      setCurrentTime(next);
      currentTimeRef.current = next;
      if (hasAudio) syncAudioTime(next);
    },
    [effectiveDuration, hasAudio, syncAudioTime]
  );

  const runVirtualLoop = useCallback(() => {
    stopVirtualLoop();
    const originWall = performance.now();
    const originTime = currentTimeRef.current;

    const tick = () => {
      const elapsed = (performance.now() - originWall) / 1000;
      const next = clampTime(originTime + elapsed, effectiveDuration);
      currentTimeRef.current = next;

      const now = performance.now();
      if (now - lastUiPublishRef.current >= 50) {
        lastUiPublishRef.current = now;
        setCurrentTime(next);
      }

      const primary = voiceRef.current?.src ? voiceRef.current : bgmRef.current;
      if (primary && hasAudio && !primary.paused) {
        const drift = Math.abs(primary.currentTime - next);
        if (drift > 0.35) syncAudioTime(next);
      }

      if (next >= effectiveDuration - 0.02) {
        setIsPlaying(false);
        voiceRef.current?.pause();
        bgmRef.current?.pause();
        stopVirtualLoop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [effectiveDuration, hasAudio, stopVirtualLoop, syncAudioTime]);

  const playAll = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    for (const el of [voiceRef.current, bgmRef.current]) {
      if (!el?.src) continue;
      el.currentTime = currentTimeRef.current;
      tasks.push(
        el.play().catch(() => {
          /* 自动播放限制或音频未就绪 */
        })
      );
    }
    await Promise.all(tasks);
  }, []);

  const play = useCallback(async () => {
    if (currentTimeRef.current >= effectiveDuration - 0.05) {
      seek(0);
    }

    setIsPlaying(true);
    await playAll();
    runVirtualLoop();
  }, [effectiveDuration, playAll, runVirtualLoop, seek]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, pause, play]);

  useEffect(() => {
    applyAudioElementMix(voiceRef.current, voiceVolume, voiceMuted);
  }, [voiceUrl, voiceVolume, voiceMuted]);

  useEffect(() => {
    applyAudioElementMix(bgmRef.current, bgmVolume, bgmMuted);
  }, [bgmUrl, bgmVolume, bgmMuted]);

  useEffect(() => {
    const onEnded = () => {
      setCurrentTime(effectiveDuration);
      currentTimeRef.current = effectiveDuration;
      setIsPlaying(false);
      stopVirtualLoop();
    };

    const voice = voiceRef.current;
    const bgm = bgmRef.current;
    voice?.addEventListener('ended', onEnded);
    bgm?.addEventListener('ended', onEnded);
    return () => {
      voice?.removeEventListener('ended', onEnded);
      bgm?.removeEventListener('ended', onEnded);
    };
  }, [effectiveDuration, stopVirtualLoop, voiceUrl, bgmUrl]);

  /** blob 就绪后若正在播放，补上音频（undefined → blob 不重置进度） */
  useEffect(() => {
    if (!voiceUrl) return;
    const prev = prevVoiceUrlRef.current;
    prevVoiceUrlRef.current = voiceUrl;
    if (prev && prev !== voiceUrl) {
      pause();
      setCurrentTime(0);
      currentTimeRef.current = 0;
      return;
    }
    if (!prev && isPlaying) void playAll();
  }, [voiceUrl, isPlaying, pause, playAll]);

  useEffect(() => {
    if (!bgmUrl) return;
    const prev = prevBgmUrlRef.current;
    prevBgmUrlRef.current = bgmUrl;
    if (prev && prev !== bgmUrl) {
      if (bgmRef.current) bgmRef.current.currentTime = currentTimeRef.current;
      if (isPlaying) void bgmRef.current?.play().catch(() => {});
      return;
    }
    if (!prev && isPlaying) void playAll();
  }, [bgmUrl, isPlaying, playAll]);

  useEffect(() => () => stopVirtualLoop(), [stopVirtualLoop]);

  return {
    voiceRef,
    bgmRef,
    /** @deprecated 使用 voiceRef */
    audioRef: voiceRef,
    currentTime,
    isPlaying,
    effectiveDuration,
    hasAudio,
    play,
    pause,
    toggle,
    seek,
    formatTime: formatTimelineTime,
  };
}
