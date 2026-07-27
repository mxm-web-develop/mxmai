'use client';

import Image from 'next/image';
import { cn } from '@/lib/cn';
import { isGatewayMediaPath } from '@/lib/media-url';

/** 任务成片：blob/data URL 与需 ?token= 的 Gateway 媒体走原生 img */
export function ResultImage({
  src,
  alt,
  className,
  fill,
  sizes = '33vw',
}: {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
}) {
  const native =
    src.startsWith('blob:') ||
    src.startsWith('data:') ||
    isGatewayMediaPath(src);

  if (native) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn(fill && 'absolute inset-0 h-full w-full object-cover', className)}
        decoding="async"
      />
    );
  }

  if (fill) {
    return (
      <Image src={src} alt={alt} fill className={className} sizes={sizes} unoptimized />
    );
  }

  return <Image src={src} alt={alt} width={512} height={512} className={className} unoptimized />;
}
