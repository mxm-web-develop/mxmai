'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import type { PlatformJobView } from '@/hooks/useProject';
import { cn } from '@/lib/cn';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';

export function HdResultsStrip({
  items,
  compact,
  emptyHint,
}: {
  items: PlatformJobView[];
  compact?: boolean;
  emptyHint?: string;
}) {
  if (!items.length && !emptyHint) return null;

  return (
    <div className={cn('space-y-1.5', compact ? 'mt-1.5' : 'mt-3')}>
      {!compact && items.length > 0 && (
        <p className="text-[11px] font-medium text-text-muted">高清放大</p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {items.length === 0 && emptyHint ? (
          <div className="flex h-16 min-w-[4.5rem] flex-1 items-center justify-center rounded-xl border border-dashed border-border/80 bg-surface-muted/50 px-3">
            <p className="text-center text-[10px] leading-snug text-text-muted">{emptyHint}</p>
          </div>
        ) : (
          items.map((item) => (
            <HdResultTile key={item.platformJobId} item={item} compact={compact} />
          ))
        )}
      </div>
    </div>
  );
}

function HdResultTile({ item, compact }: { item: PlatformJobView; compact?: boolean }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const active = item.status === 'pending' || item.status === 'processing';
  const failed = item.status === 'failed';
  const size = compact ? 'h-14 w-14 min-w-[3.5rem]' : 'h-20 w-20 min-w-[5rem]';
  const canPreview = Boolean(item.previewUrl);

  const inner = (
    <>
      {item.previewUrl ? (
        <Image
          src={item.previewUrl}
          alt="HD"
          fill
          className="object-cover"
          sizes={compact ? '56px' : '80px'}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-surface-muted px-1">
          {active ? (
            <>
              <Loader2 size={compact ? 14 : 18} className="animate-spin text-accent" />
              <span className="mt-0.5 text-[9px] text-text-muted">{item.progress}%</span>
            </>
          ) : failed ? (
            <span className="text-center text-[9px] text-danger">失败</span>
          ) : (
            <span className="text-[9px] text-text-muted">…</span>
          )}
        </div>
      )}
      {item.context?.gridCell && !compact && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 py-px text-[8px] text-white">
          {item.context.gridCell}
        </span>
      )}
    </>
  );

  return (
    <>
      {canPreview ? (
        <button
          type="button"
          aria-label={
            item.context?.gridCell
              ? `查看格位 ${item.context.gridCell} 高清大图`
              : '查看高清大图'
          }
          onClick={() => setPreviewOpen(true)}
          className={cn(
            'relative shrink-0 overflow-hidden rounded-xl ring-1 ring-border/60 pressable',
            size,
            failed && 'ring-danger/40'
          )}
        >
          {inner}
        </button>
      ) : (
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-xl ring-1 ring-border/60',
            size,
            failed && 'ring-danger/40'
          )}
        >
          {inner}
        </div>
      )}

      {item.previewUrl && (
        <FullscreenImageViewer
          open={previewOpen}
          src={item.previewUrl}
          alt={item.context?.gridCell ? `HD 格位 ${item.context.gridCell}` : 'HD 放大'}
          subtitle={
            item.context?.gridCell
              ? `高清放大 · 格位 ${item.context.gridCell}`
              : '高清放大'
          }
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
