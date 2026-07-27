'use client';

import { useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import type { JsonSchemaProperty } from '@/adapters/types';
import { compressImageFile } from '@/lib/image-compress';
import { HiddenFileInput } from '@/components/ui/HiddenFileInput';

type GarmentRow = {
  label: string;
  images: Array<{ content: string; type: string }>;
  shoot_preset?: string;
  prompt?: string;
};

function emptyRow(label = ''): GarmentRow {
  return { label, images: [], prompt: '' };
}

export function EshopGarmentBatchField({
  fieldKey,
  def,
  value,
  onChange,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: GarmentRow[]) => void;
}) {
  const rows = Array.isArray(value) ? (value as GarmentRow[]) : [];
  const maxItems = def.maxItems ?? 12;
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ rowIdx: number; mode: 'album' | 'camera' } | null>(null);

  const displayRows = useMemo(
    () => (rows.length ? rows : [emptyRow('SKU-1')]),
    [rows]
  );

  const setRows = (next: GarmentRow[]) => onChange(next);

  const addSku = () => {
    if (rows.length >= maxItems) return;
    setRows([...displayRows, emptyRow(`SKU-${displayRows.length + 1}`)]);
  };

  const updateSku = (idx: number, patch: Partial<GarmentRow>) => {
    const base = rows.length ? [...rows] : displayRows.map((r) => ({ ...r }));
    while (base.length <= idx) {
      base.push(emptyRow(`SKU-${base.length + 1}`));
    }
    base[idx] = { ...base[idx], ...patch };
    setRows(base);
  };

  const openPicker = (rowIdx: number, mode: 'album' | 'camera') => {
    uploadTarget.current = { rowIdx, mode };
    if (mode === 'camera') cameraRef.current?.click();
    else albumRef.current?.click();
  };

  const handleFile = async (files: FileList | null) => {
    const target = uploadTarget.current;
    if (!target || !files?.length) return;
    const key = `${target.rowIdx}`;
    setUploading(key);
    setUploadError(null);
    try {
      const url = await compressImageFile(files[0]);
      const row = displayRows[target.rowIdx] ?? emptyRow(`SKU-${target.rowIdx + 1}`);
      const images = [...row.images, { content: url, type: 'outfits' }].slice(0, 3);
      updateSku(target.rowIdx, { images, label: row.label || `SKU-${target.rowIdx + 1}` });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '图片上传失败');
    } finally {
      setUploading(null);
      uploadTarget.current = null;
      if (albumRef.current) albumRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{def.title ?? fieldKey}</p>
        <p className="mt-1 text-sm text-text-muted">每款 1～3 张参考图</p>
      </div>

      {uploadError && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {uploadError}
        </p>
      )}

      {displayRows.map((row, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-surface p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg bg-surface-elevated px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
              value={row.label}
              placeholder="SKU 名称"
              onChange={(e) => updateSku(idx, { label: e.target.value })}
            />
            {displayRows.length > 1 && (
              <button
                type="button"
                className="touch-target pressable text-text-muted"
                onClick={() => setRows(rows.filter((_, i) => i !== idx))}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {row.images.map((img, imgIdx) => (
              <div key={imgIdx} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                <img src={img.content} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-0 top-0 bg-black/50 p-0.5"
                  onClick={() => {
                    updateSku(idx, { images: row.images.filter((_, i) => i !== imgIdx) });
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {row.images.length < 3 && (
              <div className="flex h-20 w-20 shrink-0 flex-col gap-1">
                <button
                  type="button"
                  className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border pressable"
                  onClick={() => openPicker(idx, 'album')}
                >
                  {uploading === `${idx}` ? (
                    <Loader2 className="animate-spin text-accent" size={18} />
                  ) : (
                    <ImagePlus size={18} className="text-text-muted" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-0.5 rounded-lg bg-accent/15 py-1 text-[10px] text-accent pressable"
                  onClick={() => openPicker(idx, 'camera')}
                >
                  <Camera size={12} />
                  拍摄
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {displayRows.length < maxItems && (
        <button
          type="button"
          onClick={addSku}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-accent pressable"
        >
          <Plus size={18} />
          添加 SKU
        </button>
      )}

      <HiddenFileInput
        ref={albumRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleFile(e.target.files)}
      />
      <HiddenFileInput
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFile(e.target.files)}
      />
    </div>
  );
}
