'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import type { PlatformJobView } from '@/hooks/useProject';
import { cn } from '@/lib/cn';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';

export function HdResultsGrid({
  items,
  highlightCell,
}: {
  items: PlatformJobView[];
  highlightCell?: string | null;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-medium text-text-muted">
        高清放大 · {items.length} 张
      </p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <HdGridTile
            key={item.platformJobId}
            item={item}
            highlighted={
              Boolean(highlightCell && item.context?.gridCell === highlightCell)
            }
          />
        ))}
      </div>
    </div>
  );
}

function HdGridTile({
  item,
  highlighted,
}: {
  item: PlatformJobView;
  highlighted: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const active = item.status === 'pending' || item.status === 'processing';
  const failed = item.status === 'failed';
  const cell = item.context?.gridCell;
  const canPreview = Boolean(item.previewUrl);

  const tileBody = (
    <>
      {item.previewUrl ? (
        <Image
          src={item.previewUrl}
          alt={cell ? `HD ${cell}` : 'HD'}
          fill
          className="object-cover"
          sizes="33vw"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-surface-muted px-2">
          {active ? (
            <>
              <Loader2 size={20} className="animate-spin text-accent" />
              <span className="mt-1 text-[10px] text-text-muted">{item.progress}%</span>
            </>
          ) : failed ? (
            <span className="text-center text-[10px] text-danger">放大失败</span>
          ) : (
            <span className="text-[10px] text-text-muted">加载中</span>
          )}
        </div>
      )}
      {cell && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {cell}
        </span>
      )}
    </>
  );

  return (
    <>
      {canPreview ? (
        <button
          type="button"
          aria-label={cell ? `查看格位 ${cell} 高清大图` : '查看高清大图'}
          onClick={() => setPreviewOpen(true)}
          className={cn(
            'relative aspect-[3/4] w-full overflow-hidden rounded-xl ring-1 ring-border/60 pressable',
            highlighted && 'ring-2 ring-accent',
            failed && 'ring-danger/40'
          )}
        >
          {tileBody}
        </button>
      ) : (
        <div
          className={cn(
            'relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-border/60',
            highlighted && 'ring-2 ring-accent',
            failed && 'ring-danger/40'
          )}
        >
          {tileBody}
        </div>
      )}

      {item.previewUrl && (
        <FullscreenImageViewer
          open={previewOpen}
          src={item.previewUrl}
          alt={cell ? `HD 格位 ${cell}` : 'HD 放大'}
          subtitle={cell ? `高清放大 · 格位 ${cell}` : '高清放大'}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
