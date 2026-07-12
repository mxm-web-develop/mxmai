import { useCallback, useState } from 'react';
import type { VideoEditScript } from './types';

const MAX_HISTORY = 40;

/** 简单 undo/redo 栈，供时间轴剪辑操作使用 */
export function useTimelineEditHistory() {
  const [past, setPast] = useState<VideoEditScript[]>([]);
  const [future, setFuture] = useState<VideoEditScript[]>([]);

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  const pushSnapshot = useCallback((script: VideoEditScript) => {
    setPast((prev) => {
      const next = [...prev, structuredClone(script)];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback((current: VideoEditScript | null): VideoEditScript | null => {
    if (!current || past.length === 0) return current;
    const prev = past[past.length - 1]!;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [...stack, structuredClone(current)]);
    return prev;
  }, [past]);

  const redo = useCallback((current: VideoEditScript | null): VideoEditScript | null => {
    if (!current || future.length === 0) return current;
    const next = future[future.length - 1]!;
    setFuture((stack) => stack.slice(0, -1));
    setPast((stack) => [...stack, structuredClone(current)]);
    return next;
  }, [future, past.length]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pushSnapshot,
    undo,
    redo,
    reset,
  };
}
