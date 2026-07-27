import { useEffect, useRef } from 'react';

type TaskListLoadSentinelProps = {
  enabled: boolean;
  loading: boolean;
  onVisible: () => void;
};

/** 列表底部哨兵：进入视口时触发加载下一页 */
export function TaskListLoadSentinel({ enabled, loading, onVisible }: TaskListLoadSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loading) {
          onVisibleRef.current();
        }
      },
      { rootMargin: '160px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, loading]);

  if (!enabled) return null;

  return (
    <div className="task-grid-sentinel" ref={ref} aria-hidden>
      {loading ? <span className="task-grid-sentinel__hint">加载更多…</span> : null}
    </div>
  );
}
