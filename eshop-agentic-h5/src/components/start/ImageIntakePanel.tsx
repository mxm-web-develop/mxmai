'use client';

import { useMemo, useRef, useState } from 'react';
import { Camera, History, ImagePlus, Loader2, Shirt, Trash2, User } from 'lucide-react';
import { compressImageFile, MAX_INPUT_IMAGE_MB } from '@/lib/image-compress';
import type { StartDraftImage } from '@/lib/start-draft';
import type { HistoricalImageResource } from '@/lib/task-folder/historical-assets';
import { HistoricalResourcePicker } from '@/components/start/HistoricalResourcePicker';
import { HiddenFileInput } from '@/components/ui/HiddenFileInput';
import { cn } from '@/lib/cn';

function newId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ImageIntakePanel({
  images,
  onChange,
  maxImages = 24,
}: {
  images: StartDraftImage[];
  onChange: (next: StartDraftImage[]) => void;
  maxImages?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const selectedSourceKeys = useMemo(
    () => new Set(images.map((x) => x.sourceKey).filter(Boolean) as string[]),
    [images]
  );

  const room = maxImages - images.length;

  const handleFiles = async (files: FileList | null, defaultType: StartDraftImage['type']) => {
    if (!files?.length || room <= 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const added: StartDraftImage[] = [];
      for (let i = 0; i < Math.min(files.length, room); i++) {
        const url = await compressImageFile(files[i]);
        added.push({ id: newId(), content: url, type: defaultType });
      }
      onChange([...images, ...added]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '图片上传失败');
    } finally {
      setUploading(false);
      if (albumRef.current) albumRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const addFromHistory = async (picked: HistoricalImageResource[]) => {
    if (!picked.length) return;
    const added: StartDraftImage[] = [];
    for (const it of picked) {
      if (images.length + added.length >= maxImages) break;
      if (selectedSourceKeys.has(it.key) || added.some((a) => a.sourceKey === it.key)) continue;
      let content = it.content;
      if (content === it.previewUrl && content.startsWith('blob:')) {
        const res = await fetch(content);
        content = URL.createObjectURL(await res.blob());
      }
      added.push({
        id: newId(),
        content,
        type: 'outfits',
        sourceKey: it.key,
      });
    }
    if (added.length) onChange([...images, ...added]);
  };

  const remove = (id: string) => onChange(images.filter((x) => x.id !== id));

  const toggleType = (id: string) => {
    onChange(
      images.map((x) =>
        x.id === id
          ? { ...x, type: x.type === 'main-subject' ? 'outfits' : 'main-subject' }
          : x
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <IntakeButton
          icon={uploading ? Loader2 : ImagePlus}
          label="相册"
          sub="多选"
          spinning={uploading}
          disabled={uploading || images.length >= maxImages}
          onClick={() => albumRef.current?.click()}
          variant="default"
        />
        <IntakeButton
          icon={Camera}
          label="拍摄"
          sub="现场"
          disabled={uploading || images.length >= maxImages}
          onClick={() => cameraRef.current?.click()}
          variant="accent"
        />
        <IntakeButton
          icon={History}
          label="历史"
          sub="本机"
          disabled={uploading || images.length >= maxImages}
          onClick={() => setHistoryOpen(true)}
          variant="muted"
        />
      </div>

      <HiddenFileInput
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleFiles(e.target.files, 'outfits')}
      />
      <HiddenFileInput
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFiles(e.target.files, 'outfits')}
      />

      <HistoricalResourcePicker
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        maxSelect={room}
        alreadySelectedKeys={selectedSourceKeys}
        onConfirm={(items) => void addFromHistory(items)}
      />

      <p className="text-center text-xs text-text-muted">
        已选 <span className="font-semibold text-text">{images.length}</span> / {maxImages}
        · 支持 {MAX_INPUT_IMAGE_MB}MB 原图，自动压缩后上传
      </p>

      {uploadError && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {uploadError}
        </p>
      )}

      {images.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">角标可切换：服装 SKU / 模特参考</p>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-surface-muted shadow-sm"
              >
                <img src={img.content} alt="" className="h-full w-full object-cover" />
                {img.sourceKey && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                    历史
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleType(img.id)}
                  className={cn(
                    'absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] font-semibold shadow-sm pressable',
                    img.type === 'main-subject'
                      ? 'bg-accent text-white'
                      : 'bg-surface/95 text-text-secondary'
                  )}
                >
                  {img.type === 'main-subject' ? (
                    <User size={11} />
                  ) : (
                    <Shirt size={11} />
                  )}
                  {img.type === 'main-subject' ? '模特' : '服装'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  className="absolute right-1.5 top-1.5 rounded-lg bg-black/50 p-1.5 text-white backdrop-blur-sm pressable"
                  aria-label="删除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IntakeButton({
  icon: Icon,
  label,
  sub,
  onClick,
  disabled,
  variant,
  spinning,
}: {
  icon: typeof ImagePlus;
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
  variant: 'default' | 'accent' | 'muted';
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-5 pressable disabled:opacity-45',
        variant === 'accent' && 'border-accent/30 bg-accent-soft',
        variant === 'default' && 'border-border bg-surface',
        variant === 'muted' && 'border-border bg-surface-muted/50'
      )}
    >
      <Icon
        size={26}
        className={cn(
          spinning && 'animate-spin',
          variant === 'accent' ? 'text-accent' : 'text-text-secondary'
        )}
      />
      <span className="text-sm font-semibold text-text">{label}</span>
      <span className="text-[10px] text-text-muted">{sub}</span>
    </button>
  );
}
