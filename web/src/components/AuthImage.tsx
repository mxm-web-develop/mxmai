/**
 * 带认证的图片组件 - 使用 token 请求需要认证的媒体 URL
 * 因 <img src> 不会自动携带 Authorization 头，需用 fetch 拉取后转为 blob URL
 */

import { useState, useEffect, useRef } from 'react';
import { getStoredToken } from '../api/client';

function getFullUrl(src: string): string {
  if (src.startsWith('http')) return src;
  const base = (typeof window !== 'undefined' && (localStorage.getItem('api_base_url') || '').replace(/\/$/, '')) || '';
  return base ? `${base}${src.startsWith('/') ? '' : '/'}${src}` : src.startsWith('/') ? src : `/${src}`;
}

interface AuthImageProps {
  src: string;
  alt?: string;
  className?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  style?: React.CSSProperties;
  /** 加载中或失败时渲染的内容 */
  fallback?: React.ReactNode;
}

export function AuthImage({ src, alt = '', className, referrerPolicy, onError, style, fallback }: AuthImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!src) return;

    const token = getStoredToken();
    const url = getFullUrl(src);

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'same-origin',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        blobRef.current = u;
        setBlobUrl(u);
      })
      .catch(() => setFailed(true));

    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [src]);

  if (failed || !blobUrl) return fallback != null ? <>{fallback}</> : null;

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      referrerPolicy={referrerPolicy}
      onError={onError}
      style={style}
    />
  );
}
