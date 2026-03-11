/**
 * 写作查看弹窗 - 按细分类型分别渲染（参考 mobile writing-viewer）
 * - storyboard-scripts: 分镜 chunks 卡片
 * - lyrics + suno: Suno JSON 结构化
 * - voice-scripts: 纯文本
 * - articles/其他: Markdown 或纯文本
 */

import { useState, useMemo } from 'react';
import type { WritingTaskItem } from '../api/client';

function simpleMarkdownToHtml(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br />');
  return html;
}

interface WritingViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  content: string;
  task: WritingTaskItem | null;
  loading?: boolean;
  error?: string | null;
}

interface StoryboardChunk {
  index?: number;
  chunk_seconds?: number;
  video_description?: string;
  camera_movement?: string;
  dialogue?: string;
  sound_effects?: string;
  transition?: string;
  characters_in_shot?: string[];
  shot_timeline?: string[];
  shots?: Array<{
    shot_index?: number;
    chunk_seconds?: number;
    video_description?: string;
    dialogue?: string;
    camera_movement?: string;
    sound_effects?: string;
    transition?: string;
    shot_timeline?: string[];
  }>;
  prompt?: string;
}

interface SunoData {
  title?: string;
  prompt: string;
  tags?: string;
  negative_tags?: string;
}

function resolveWritingInfo(task: WritingTaskItem | null): { writingType?: string; format?: string } {
  if (!task) return {};
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const innerParams = params?.params as Record<string, unknown> | undefined;
  return {
    writingType:
      (task.metadata?.writing_type as string) ??
      (params?.writing_type as string) ??
      (innerParams?.writing_type as string) ??
      undefined,
    format: (params?.format as string) ?? (innerParams?.format as string) ?? undefined,
  };
}

function StoryboardChunksView({ chunks }: { chunks: StoryboardChunk[] }) {
  const summary = useMemo(() => {
    let shotCount = 0;
    let totalSeconds = 0;
    const roleSet = new Set<string>();
    for (const c of chunks) {
      totalSeconds += Number(c.chunk_seconds || 0) || 0;
      const cAny = c as any;
      if (Array.isArray(cAny.characters_in_shot)) {
        for (const r of cAny.characters_in_shot) if (r) roleSet.add(String(r).trim());
      }
      if (Array.isArray(c.shots) && c.shots.length > 0) {
        shotCount += c.shots.length;
        for (const s of c.shots) {
          const sAny = s as any;
          if (Array.isArray(sAny.characters_in_shot)) {
            for (const r of sAny.characters_in_shot) if (r) roleSet.add(String(r).trim());
          }
        }
      } else {
        shotCount += 1;
      }
    }
    return { chunkCount: chunks.length, shotCount, totalSeconds, roles: Array.from(roleSet).filter(Boolean) };
  }, [chunks]);

  return (
    <div className="wv-storyboard">
      <div className="wv-storyboard-summary">
        <div className="wv-summary-title">分镜统计</div>
        <div className="wv-summary-line">
          段落 {summary.chunkCount} · 镜头 {summary.shotCount} · 总时长 {Math.round(summary.totalSeconds)} 秒
        </div>
        {summary.roles.length > 0 && (
          <div className="wv-summary-line">角色：{summary.roles.join('、')}</div>
        )}
      </div>
      {chunks.map((chunk, i) => {
        const hasShots = (chunk.shots?.length ?? 0) > 0;
        const idx = chunk.index ?? i + 1;
        const secs = chunk.chunk_seconds ?? 15;
        return (
          <div key={idx} className="wv-chunk-card">
            <div className="wv-chunk-title">
              {hasShots
                ? `段落 ${idx}（${secs} 秒，含 ${chunk.shots!.length} 个镜头）`
                : `镜头 ${idx}（${secs} 秒）`}
            </div>
            {chunk.shot_timeline?.length && !hasShots && (
              <div className="wv-chunk-meta">
                <span className="wv-meta-label">时间线</span>
                {chunk.shot_timeline.map((seg) => `[${seg}]`).join(' ')}
              </div>
            )}
            {hasShots ? (
              <div className="wv-chunk-shots">
                {chunk.shots!.map((shot, si) => (
                  <div key={si} className="wv-shot">
                    <div className="wv-shot-meta">
                      镜头 {shot.shot_index}
                      {shot.shot_timeline?.[0] && ` · ${shot.shot_timeline[0]}`}
                    </div>
                    <div className="wv-shot-desc">{shot.video_description || '—'}</div>
                    {shot.dialogue && <div className="wv-shot-dialogue">对话：{shot.dialogue}</div>}
                    {shot.camera_movement && <div className="wv-shot-extra">运镜：{shot.camera_movement}</div>}
                    {shot.sound_effects && <div className="wv-shot-extra">音效：{shot.sound_effects}</div>}
                    {shot.transition && <div className="wv-shot-extra">转场：{shot.transition}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {(chunk.video_description ?? '').trim() && (
                  <div className="wv-shot-desc">{chunk.video_description}</div>
                )}
                {chunk.dialogue && (
                  <div className="wv-shot-dialogue">对话：{chunk.dialogue}</div>
                )}
                {chunk.camera_movement && (
                  <div className="wv-chunk-meta">
                    <span className="wv-meta-label">运镜</span>
                    {chunk.camera_movement}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      <style>{`
        .wv-storyboard { padding: 0.5rem 0; }
        .wv-storyboard-summary {
          padding: 12px;
          margin-bottom: 16px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
        }
        .wv-summary-title { font-weight: 600; font-size: 1rem; color: #e0e0e0; margin-bottom: 6px; }
        .wv-summary-line { font-size: 0.875rem; color: #888; }
        .wv-chunk-card {
          padding: 12px;
          margin-bottom: 12px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
        }
        .wv-chunk-title { font-weight: 600; font-size: 0.95rem; color: #e0e0e0; margin-bottom: 8px; }
        .wv-chunk-meta, .wv-shot-meta { font-size: 0.8rem; color: #888; margin-bottom: 4px; }
        .wv-meta-label { margin-right: 6px; }
        .wv-chunk-shots { margin-top: 8px; }
        .wv-shot {
          padding-left: 12px;
          margin-bottom: 10px;
          border-left: 2px solid hsl(var(--border));
        }
        .wv-shot-desc { font-size: 0.9rem; color: #e0e0e0; margin-bottom: 4px; }
        .wv-shot-dialogue { font-size: 0.85rem; color: #93c5fd; margin-top: 4px; }
        .wv-shot-extra { font-size: 0.8rem; color: #888; margin-top: 2px; }
      `}</style>
    </div>
  );
}

function SunoJsonView({ data }: { data: SunoData }) {
  return (
    <div className="wv-suno">
      {data.title && (
        <div className="wv-suno-block">
          <div className="wv-suno-label">歌曲标题</div>
          <div className="wv-suno-value">{data.title}</div>
        </div>
      )}
      <div className="wv-suno-block">
        <div className="wv-suno-label">歌词内容</div>
        <div className="wv-suno-content">{data.prompt}</div>
      </div>
      {(data.tags || data.negative_tags) && (
        <div className="wv-suno-meta">
          {data.tags && (
            <div>
              <div className="wv-suno-label">音乐标签</div>
              <div className="wv-suno-value">{data.tags}</div>
            </div>
          )}
          {data.negative_tags && (
            <div>
              <div className="wv-suno-label">负面标签</div>
              <div className="wv-suno-value">{data.negative_tags}</div>
            </div>
          )}
        </div>
      )}
      <style>{`
        .wv-suno { padding: 0.5rem 0; }
        .wv-suno-block { margin-bottom: 16px; }
        .wv-suno-label { font-weight: 600; font-size: 0.95rem; color: #aaa; margin-bottom: 4px; }
        .wv-suno-value { font-size: 0.9rem; color: #e0e0e0; }
        .wv-suno-content {
          padding: 12px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          font-size: 0.9rem;
          line-height: 1.6;
          color: hsl(var(--foreground));
          white-space: pre-wrap;
        }
        .wv-suno-meta { margin-top: 12px; }
      `}</style>
    </div>
  );
}

export function WritingViewerModal({
  visible,
  onClose,
  title = '写作内容',
  content,
  task,
  loading = false,
  error = null,
}: WritingViewerModalProps) {
  const [viewMode, setViewMode] = useState<'content' | 'raw'>('content');

  const { writingType, format } = resolveWritingInfo(task);
  const isStoryboard = writingType === 'storyboard-scripts';
  const isSunoJson = writingType === 'lyrics' && format === 'suno';
  const isPlainText = writingType === 'voice-scripts';

  const storyboardChunks = useMemo((): StoryboardChunk[] | null => {
    if (!isStoryboard || !content?.trim()) return null;
    try {
      const parsed = JSON.parse(content.trim());
      let raw: unknown[] = Array.isArray(parsed) ? parsed : parsed?.chunks;
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const flat: StoryboardChunk[] = [];
      for (let i = 0; i < raw.length; i++) {
        let item = raw[i] as Record<string, unknown>;
        if (!item || typeof item !== 'object') continue;
        const vd = item.video_description;
        if (typeof vd === 'string' && (vd.trimStart().startsWith('{') || vd.trimStart().startsWith('['))) {
          try {
            const inner = JSON.parse(vd);
            const innerChunks = Array.isArray(inner) ? inner : inner?.chunks;
            if (Array.isArray(innerChunks) && innerChunks.length > 0) {
              item = { ...item, ...innerChunks[0] } as Record<string, unknown>;
            }
          } catch {
            /* ignore */
          }
        }
        const inner = item.chunks;
        if (Array.isArray(inner)) {
          inner.forEach((c: unknown) => flat.push({ ...(c as StoryboardChunk), index: (c as any)?.index ?? flat.length + 1 }));
        } else {
          flat.push({ ...(item as StoryboardChunk), index: (item.index as number) ?? flat.length + 1 });
        }
      }
      return flat.length > 0 ? flat : null;
    } catch {
      return null;
    }
  }, [isStoryboard, content]);

  const sunoData = useMemo((): SunoData | null => {
    if (!isSunoJson || !content) return null;
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed?.prompt && typeof parsed.prompt === 'string') {
        return {
          title: parsed.title,
          prompt: parsed.prompt,
          tags: parsed.tags,
          negative_tags: parsed.negative_tags,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [isSunoJson, content]);

  const markdownHtml = useMemo(() => {
    if (!content?.trim() || isPlainText || storyboardChunks || sunoData) return null;
    return simpleMarkdownToHtml(content.trim());
  }, [content, isPlainText, storyboardChunks, sunoData]);

  const renderContent = () => {
    if (storyboardChunks) {
      return <StoryboardChunksView chunks={storyboardChunks} />;
    }
    if (sunoData) {
      return <SunoJsonView data={sunoData} />;
    }
    if (isPlainText) {
      return (
        <pre className="writing-viewer-pre writing-viewer-plain">
          {content || '暂无内容'}
        </pre>
      );
    }
    if (markdownHtml) {
      return (
        <div
          className="writing-viewer-markdown"
          dangerouslySetInnerHTML={{ __html: markdownHtml }}
        />
      );
    }
    return (
      <pre className="writing-viewer-pre">
        {content || '暂无内容（任务可能未完成或尚未存储）'}
      </pre>
    );
  };

  if (!visible) return null;

  return (
    <>
      <div className="writing-viewer-overlay" onClick={onClose} aria-hidden="true" />
      <div className="writing-viewer-modal">
        <div className="writing-viewer-header">
          <h3 className="writing-viewer-title">{title}</h3>
          <div className="writing-viewer-actions">
            <button
              type="button"
              className={`writing-viewer-tab ${viewMode === 'content' ? 'active' : ''}`}
              onClick={() => setViewMode('content')}
            >
              内容
            </button>
            <button
              type="button"
              className={`writing-viewer-tab ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
            >
              查看数据
            </button>
            <button type="button" className="writing-viewer-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="writing-viewer-body">
          {loading ? (
            <p className="writing-viewer-loading">加载中...</p>
          ) : error ? (
            <p className="writing-viewer-error">{error}</p>
          ) : viewMode === 'content' ? (
            <div className="writing-viewer-content">{renderContent()}</div>
          ) : (
            <div className="writing-viewer-raw">
              <pre className="writing-viewer-pre">
                {task ? JSON.stringify(task, null, 2) : '暂无任务数据'}
              </pre>
            </div>
          )}
        </div>
        <style>{`
          .writing-viewer-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .writing-viewer-modal {
            position: fixed;
            inset: 0;
            z-index: 1001;
            background: hsl(var(--background));
            border: 1px solid hsl(var(--border));
            border-radius: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .writing-viewer-header {
            flex-shrink: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #333;
          }
          .writing-viewer-title {
            margin: 0;
            font-size: 1.1rem;
            color: #e0e0e0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 50%;
          }
          .writing-viewer-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .writing-viewer-tab {
            padding: 0.35rem 0.75rem;
            border-radius: 6px;
            border: 1px solid #444;
            background: transparent;
            color: #888;
            font-size: 0.85rem;
            cursor: pointer;
          }
          .writing-viewer-tab:hover {
            background: #333;
            color: #e0e0e0;
          }
          .writing-viewer-tab.active {
            background: #1e3a5f;
            color: #93c5fd;
            border-color: #1e3a5f;
          }
          .writing-viewer-close {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0 0.5rem;
            line-height: 1;
          }
          .writing-viewer-close:hover {
            color: #e0e0e0;
          }
          .writing-viewer-body {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 1rem 1.5rem;
          }
          .writing-viewer-loading,
          .writing-viewer-error,
          .writing-viewer-empty {
            margin: 0;
            color: #888;
          }
          .writing-viewer-error { color: #fca5a5; }
          .writing-viewer-content,
          .writing-viewer-raw {
            height: 100%;
          }
          .writing-viewer-pre {
            margin: 0;
            padding: 1rem;
            background: #0f172a;
            border-radius: 8px;
            font-size: 0.85rem;
            color: #e0e0e0;
            overflow: auto;
            max-height: 70vh;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.5;
          }
          .writing-viewer-plain {
            background: transparent;
            padding: 0;
          }
          .writing-viewer-markdown {
            font-size: 0.9rem;
            line-height: 1.6;
            color: #e0e0e0;
          }
          .writing-viewer-markdown h1, .writing-viewer-markdown h2, .writing-viewer-markdown h3 {
            margin: 1rem 0 0.5rem;
            color: #e0e0e0;
          }
          .writing-viewer-markdown p { margin: 0.5rem 0; }
          .writing-viewer-markdown ul, .writing-viewer-markdown ol { margin: 0.5rem 0; padding-left: 1.5rem; }
          .writing-viewer-markdown code { background: #333; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.85em; }
        `}</style>
      </div>
    </>
  );
}
