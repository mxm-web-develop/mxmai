'use client';

import { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { JsonSchemaProperty } from '@/adapters/types';
import { compressImageFile } from '@/lib/image-compress';
import { HiddenFileInput } from '@/components/ui/HiddenFileInput';
import { cn } from '@/lib/cn';

type RefRow = { content: string; type: string };

export function ReferenceImagesField({
  fieldKey,
  def,
  value,
  onChange,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: RefRow[]) => void;
}) {
  const rows = Array.isArray(value) ? (value as RefRow[]) : [];
  const maxItems = def.maxItems ?? 6;
  const minItems = def.minItems ?? 0;
  const defaultType =
    (def.items?.properties?.type as { default?: string } | undefined)?.default ?? 'main-subject';
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const targetIdx = useRef<number | null>(null);

  const updateRow = (idx: number, patch: Partial<RefRow>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const ensureSlots = (): RefRow[] => {
    if (rows.length > 0) return rows;
    const n = Math.max(1, minItems);
    return Array.from({ length: n }, () => ({ content: '', type: defaultType }));
  };

  const slots = ensureSlots();

  const addSlot = () => {
    if (rows.length >= maxItems) return;
    onChange([...rows, { content: '', type: defaultType }]);
  };

  const removeRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    onChange(next.length ? next : [{ content: '', type: defaultType }]);
  };

  const handleFiles = async (files: FileList | null) => {
    const idx = targetIdx.current;
    if (!files?.length || idx === null) return;
    setUploading(idx);
    setUploadError(null);
    try {
      const url = await compressImageFile(files[0]);
      const base = rows.length ? [...rows] : [...slots];
      while (base.length <= idx) {
        base.push({ content: '', type: defaultType });
      }
      base[idx] = { ...base[idx], content: url, type: defaultType };
      onChange(base.filter((r) => r.content.trim()));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '图片上传失败');
    } finally {
      setUploading(null);
      targetIdx.current = null;
      if (albumRef.current) albumRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const openPicker = (idx: number, mode: 'album' | 'camera') => {
    targetIdx.current = idx;
    if (mode === 'camera') cameraRef.current?.click();
    else albumRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium">{def.title ?? fieldKey}</p>
        {def.description && <p className="mt-1 text-sm text-text-muted">{def.description}</p>}
        <p className="mt-1 text-xs text-text-muted">大图自动压缩至约 1.5MB · 最长边 1920px</p>
      </div>
      {uploadError && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {uploadError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {slots.map((row, idx) => (
          <div
            key={idx}
            className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-border bg-surface"
          >
            {row.content ? (
              <>
                <img src={row.content} alt="" className="h-full w-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 flex gap-1 bg-black/60 p-1.5">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-white/15 py-1.5 text-xs pressable"
                    onClick={() => openPicker(idx, 'album')}
                  >
                    相册
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-white/15 py-1.5 text-xs pressable"
                    onClick={() => openPicker(idx, 'camera')}
                  >
                    拍摄
                  </button>
                  <button
                    type="button"
                    className="touch-target rounded-lg bg-white/15 p-1.5 pressable"
                    onClick={() => removeRow(idx)}
                    aria-label="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-2">
                {uploading === idx ? (
                  <Loader2 className="animate-spin text-accent" size={28} />
                ) : (
                  <>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-border/80 pressable'
                      )}
                      onClick={() => openPicker(idx, 'album')}
                    >
                      <ImagePlus size={22} className="text-text-muted" />
                      <span className="text-xs text-text-muted">相册</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1 rounded-lg bg-accent/15 py-2 text-xs text-accent pressable"
                      onClick={() => openPicker(idx, 'camera')}
                    >
                      <Camera size={16} />
                      拍摄
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {slots.length < maxItems && (
          <button
            type="button"
            onClick={addSlot}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-elevated pressable"
          >
            <span className="text-2xl text-text-muted">+</span>
            <span className="text-xs text-text-muted">添加参考</span>
          </button>
        )}
      </div>
      <HiddenFileInput
        ref={albumRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <HiddenFileInput
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
