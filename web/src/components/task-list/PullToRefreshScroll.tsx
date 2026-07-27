import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './pull-to-refresh-scroll.css';

const PULL_THRESHOLD = 52;
const PULL_MAX = 80;
const MOBILE_MQ = '(max-width: 768px)';

type UsePullToRefreshOptions = {
  disabled?: boolean;
  refreshing?: boolean;
  onPullChange?: (distance: number) => void;
};

function usePullToRefresh(
  containerRef: RefObject<HTMLElement | null>,
  onRefresh: () => void | Promise<void>,
  { disabled = false, refreshing = false, onPullChange }: UsePullToRefreshOptions
) {
  const pullRef = useRef(0);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return undefined;

    const setPull = (value: number) => {
      pullRef.current = value;
      onPullChange?.(value);
    };

    const isMobile = () => window.matchMedia(MOBILE_MQ).matches;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile() || refreshing) return;
      if (el.scrollTop > 0) return;
      startYRef.current = e.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshing) return;
      const touchY = e.touches[0]?.clientY ?? 0;
      const delta = touchY - startYRef.current;

      if (delta <= 0 || el.scrollTop > 0) {
        if (pullRef.current > 0) setPull(0);
        return;
      }

      e.preventDefault();
      setPull(Math.min(delta * 0.45, PULL_MAX));
    };

    const finishPull = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const distance = pullRef.current;
      const shouldRefresh = distance >= PULL_THRESHOLD;
      setPull(0);
      if (shouldRefresh && !refreshing) {
        void onRefreshRef.current();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', finishPull);
    el.addEventListener('touchcancel', finishPull);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finishPull);
      el.removeEventListener('touchcancel', finishPull);
    };
  }, [containerRef, disabled, refreshing, onPullChange]);
}

export type PullToRefreshScrollProps = {
  className?: string;
  onRefresh: () => void | Promise<void>;
  refreshing?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

/** 移动端下拉刷新；桌面端仅为普通滚动容器 */
export function PullToRefreshScroll({
  className = '',
  onRefresh,
  refreshing = false,
  disabled = false,
  children,
}: PullToRefreshScrollProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const handlePullChange = useCallback((distance: number) => {
    setPullDistance(distance);
  }, []);

  usePullToRefresh(ref, onRefresh, {
    disabled: disabled || !mobile,
    refreshing,
    onPullChange: handlePullChange,
  });

  const indicatorHeight = refreshing ? 36 : Math.round(pullDistance);
  const showIndicator = mobile && (refreshing || pullDistance > 0);
  const ready = pullDistance >= PULL_THRESHOLD;

  return (
    <div
      ref={ref}
      className={[
        'pull-to-refresh-scroll',
        className,
        refreshing ? 'pull-to-refresh-scroll--refreshing' : '',
        showIndicator ? 'pull-to-refresh-scroll--pulling' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {mobile ? (
        <div
          className="pull-to-refresh-scroll__indicator"
          style={{ height: showIndicator ? indicatorHeight : 0 }}
          aria-live="polite"
        >
          <RefreshCw
            size={15}
            strokeWidth={2}
            className={refreshing ? 'pull-to-refresh-scroll__icon--spin' : ''}
            style={{
              transform: refreshing ? undefined : `rotate(${Math.min(pullDistance * 2.2, 180)}deg)`,
              opacity: refreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
            }}
            aria-hidden
          />
          <span className="pull-to-refresh-scroll__hint">
            {refreshing
              ? t('common.task.pullRefresh.refreshing')
              : ready
                ? t('common.task.pullRefresh.release')
                : t('common.task.pullRefresh.pull')}
          </span>
        </div>
      ) : null}
      <div
        className="pull-to-refresh-scroll__body"
        style={
          showIndicator
            ? { transform: `translateY(${indicatorHeight}px)` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

export type GenerationTaskListScrollProps = Omit<PullToRefreshScrollProps, 'className'> & {
  className: string;
};

/** 生成任务列表滚动区 — 带移动端下拉刷新 */
export function GenerationTaskListScroll(props: GenerationTaskListScrollProps) {
  return <PullToRefreshScroll {...props} />;
}
