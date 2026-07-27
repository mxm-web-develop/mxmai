'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { GridShootLineId } from '@/catalog/grid-shoot-lines';
import { cn } from '@/lib/cn';
import { LineCardIllustrationSvg } from '@/components/studio/LineCardIllustrationSvg';

const LINE_IMAGE: Record<GridShootLineId, string> = {
  women: '/brand/line-women.png',
  men: '/brand/line-men.png',
  kids: '/brand/line-kids.png',
};

type Props = {
  lineId: GridShootLineId;
  className?: string;
};

export function LineCardIllustration({ lineId, className }: Props) {
  const [useSvg, setUseSvg] = useState(false);
  const src = LINE_IMAGE[lineId];

  return (
    <div
      className={cn(
        'pointer-events-none absolute -bottom-2 -right-2 h-24 w-24',
        className
      )}
      aria-hidden
    >
      {!useSvg ? (
        <Image
          src={src}
          alt=""
          width={192}
          height={192}
          className="h-full w-full object-contain object-bottom opacity-90"
          onError={() => setUseSvg(true)}
          unoptimized
        />
      ) : (
        <LineCardIllustrationSvg lineId={lineId} />
      )}
    </div>
  );
}
