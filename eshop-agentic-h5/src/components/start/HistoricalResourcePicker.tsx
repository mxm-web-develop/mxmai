'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/schema/BottomSheet';
import {
  listHistoricalImageResources,
  revokeHistoricalPreviews,
  type HistoricalImageResource,
} from '@/lib/task-folder/historical-assets';
import { cn } from '@/lib/cn';

export function HistoricalResourcePicker({
  open,
  onClose,
  maxSelect,
  alreadySelectedKeys,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  maxSelect: number;
  alreadySelectedKeys: Set<string>;
  onConfirm: (items: HistoricalImageResource[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HistoricalImageResource[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const closeAndRevokeUnused = (usedKeys: Set<string>) => {
    revokeHistoricalPreviews(items.filter((it) => !usedKeys.has(it.key)));
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setLoading(true);
    void listHistoricalImageResources()
      .then((list) => setItems(list))
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (key: string) => {
    if (alreadySelectedKeys.has(key)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < maxSelect) next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = items.filter((it) => picked.has(it.key));
    const used = new Set([...alreadySelectedKeys, ...picked]);
    onConfirm(selected);
    revokeHistoricalPreviews(items.filter((it) => !used.has(it.key)));
    onClose();
  };

  const grouped = items.reduce<Record<string, HistoricalImageResource[]>>((acc, it) => {
    if (!acc[it.jobId]) acc[it.jobId] = [];
    acc[it.jobId].push(it);
    return acc;
  }, {});

  return (
    <BottomSheet
      open={open}
      onClose={() => closeAndRevokeUnused(alreadySelectedKeys)}
      title="历史资源"
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-accent" size={28} />
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-muted">
          <p>暂无本地成片</p>
          <p className="mt-2">完成一次生成后，成片会保存在本机任务目录</p>
          <Link href="/history" onClick={onClose} className="mt-4 inline-block text-accent pressable">
            查看历史记录
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-text-muted">
            从本机任务目录选择已生成的图片（最多再选 {maxSelect} 张）
          </p>
          <div className="space-y-6">
            {Object.entries(grouped).map(([jobId, group]) => (
              <section key={jobId}>
                <p className="mb-2 truncate text-sm font-medium">{group[0]?.jobTitle}</p>
                <div className="grid grid-cols-4 gap-2">
                  {group.map((it) => {
                    const disabled = alreadySelectedKeys.has(it.key);
                    const selected = picked.has(it.key);
                    return (
                      <button
                        key={it.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(it.key)}
                        className={cn(
                          'relative aspect-square overflow-hidden rounded-lg pressable',
                          disabled && 'opacity-40',
                          selected && 'ring-2 ring-accent'
                        )}
                      >
                        <img src={it.previewUrl} alt="" className="h-full w-full object-cover" />
                        {selected && (
                          <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-black">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        )}
                        {it.label && (
                          <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">
                            {it.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={handleConfirm}
            className="mt-6 w-full rounded-xl bg-accent py-3 font-medium text-black pressable disabled:opacity-50"
          >
            添加{picked.size > 0 ? ` (${picked.size})` : ''}
          </button>
        </>
      )}
    </BottomSheet>
  );
}
