import { useEffect, useState, type ReactNode } from 'react';
import BrandLoading from './BrandLoading';
import './PageLoading.css';

const STATUS_MESSAGES = [
  '正在唤醒创作引擎…',
  '加载 AI 工作区模块…',
  '初始化多媒体管线…',
  '准备智能生成界面…',
];

export type PageLoadingVariant = 'splash' | 'embedded';

export type PageLoadingProps = {
  /** splash：全视口启动页；embedded：主内容区内加载 */
  variant?: PageLoadingVariant;
  tip?: ReactNode;
};

/** lazy 路由首次解析完成后标记，后续切换用 embedded 模式 */
let lazyRouteBootComplete = false;

export function LazyRouteReady({ children }: { children: ReactNode }) {
  useEffect(() => {
    lazyRouteBootComplete = true;
    document.getElementById('app-boot-splash')?.remove();
  }, []);
  return children;
}

export function resolvePageLoadingVariant(): PageLoadingVariant {
  return lazyRouteBootComplete ? 'embedded' : 'splash';
}

export default function PageLoading({ variant = 'splash', tip }: PageLoadingProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const isSplash = variant === 'splash';

  useEffect(() => {
    if (!isSplash) return undefined;
    const timer = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [isSplash]);

  const message = tip ?? (isSplash ? STATUS_MESSAGES[messageIndex] : '加载中…');

  return (
    <div
      className={`page-loading page-loading--${variant}`}
      role="status"
      aria-live="polite"
      aria-label="页面加载中"
    >
      <div className="page-loading__ambient" aria-hidden="true">
        <span className="page-loading__glow page-loading__glow--a" />
        <span className="page-loading__glow page-loading__glow--b" />
        <span className="page-loading__glow page-loading__glow--c" />
        {isSplash ? <span className="page-loading__grid" /> : null}
      </div>

      <div className="page-loading__stage">
        <div className="page-loading__mark" aria-hidden="true">
          <BrandLoading size={isSplash ? 'large' : 'default'} />
        </div>

        {isSplash ? (
          <>
            <p className="page-loading__brand">SuperMXM</p>
            <p className="page-loading__tagline">Mind × Machine · AI 创作中台</p>
          </>
        ) : null}

        <p className="page-loading__message" key={isSplash ? messageIndex : 'embedded'}>
          {message}
        </p>

        {isSplash ? (
          <div className="page-loading__progress" aria-hidden="true">
            <span className="page-loading__progress-track">
              <span className="page-loading__progress-fill" />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
