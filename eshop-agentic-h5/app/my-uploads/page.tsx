'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2, ImageIcon } from 'lucide-react';
import { RequireSmsLogin } from '@/components/auth/RequireSmsLogin';
import {
  deleteMyPartnerUpload,
  listMyPartnerUploads,
  resolvePartnerUploadPreviewUrl,
  type PartnerUploadListItem,
} from '@/lib/partner-uploads';

function formatExpiresAt(expiresAt: string | null): string {
  if (!expiresAt) return '长期';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function MyUploadsContent() {
  const [items, setItems] = useState<PartnerUploadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMyPartnerUploads({ limit: 100 });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (item: PartnerUploadListItem) => {
    if (!window.confirm(`确定删除「${item.originalName || item.id.slice(0, 8)}」？`)) return;
    setDeletingId(item.id);
    try {
      await deleteMyPartnerUpload(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">我的上传</h1>
          <p className="mt-1 text-sm text-text-muted">参考图与表单附件（临时文件，到期自动清理）</p>
        </div>
        <button
          type="button"
          className="text-sm text-accent"
          onClick={() => void load()}
          disabled={loading}
        >
          刷新
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16 text-text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border/70 bg-bg-elevated px-4 py-10 text-center">
          <ImageIcon className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <p className="text-sm text-text-muted">还没有上传记录</p>
          <Link href="/start" className="mt-4 inline-block text-sm text-accent">
            去创作
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {items.map((item) => {
            const preview = resolvePartnerUploadPreviewUrl(item.url);
            const isImage = (item.contentType ?? '').startsWith('image/');
            return (
              <li
                key={item.id}
                className="overflow-hidden rounded-xl border border-border/70 bg-bg-elevated"
              >
                <div className="relative aspect-square bg-bg-subtle">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-text-muted">
                      {item.contentType ?? '文件'}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white"
                    onClick={() => void handleDelete(item)}
                    disabled={deletingId === item.id}
                    aria-label="删除"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="space-y-0.5 px-2 py-2 text-xs text-text-muted">
                  <p className="truncate text-text-primary">{item.originalName || item.id.slice(0, 8)}</p>
                  <p>过期：{formatExpiresAt(item.expiresAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function MyUploadsPage() {
  return (
    <RequireSmsLogin>
      <MyUploadsContent />
    </RequireSmsLogin>
  );
}
