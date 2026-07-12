import { useEffect, useRef, useState } from 'react';

/** 会话内图片预加载缓存，避免播放头反复经过同一片段时重复拉取 */
const globalLoaded = new Set<string>();

export function useStaticImagePreload(urls: string[]) {
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const urlsKey = urls.join('\0');

  useEffect(() => {
    const unique = [...new Set(urls.filter(Boolean))];
    if (!unique.length) return;

    let cancelled = false;
    const pending: Promise<void>[] = [];

    for (const url of unique) {
      if (globalLoaded.has(url)) {
        setReady((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
        continue;
      }
      pending.push(
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          const done = () => {
            globalLoaded.add(url);
            if (!cancelled) {
              setReady((prev) => new Set(prev).add(url));
            }
            resolve();
          };
          img.onload = done;
          img.onerror = done;
          img.src = url;
        })
      );
    }

    void Promise.all(pending);
    return () => {
      cancelled = true;
    };
  }, [urlsKey]);

  const readyRef = useRef(ready);
  readyRef.current = ready;

  return {
    isReady: (url?: string) => !url || globalLoaded.has(url) || ready.has(url),
  };
}
