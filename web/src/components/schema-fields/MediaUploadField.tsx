/**
 * MediaUploadField — 统一单文件上传字段
 *
 * 主区固定为上传框 / URL 输入；「我的资源」（知识库 + 已上传管理）与免费图库均为独立 Modal。
 *
 * 4 种 mode：
 * - image    图片（粘贴 URL / 拖拽上传 / Base64 / 免费素材库 / 我的资源）
 * - file     通用文件（粘贴 URL / 拖拽上传 / 我的资源）
 * - audio    音频（粘贴 URL / 拖拽上传 / 我的资源）
 * - document 文档（粘贴 URL / 拖拽上传 / 我的资源）
 */
import { useCallback, useRef, useState } from 'react';
import { App, Input, Space, Typography } from 'antd';
import {
  FileAudio,
  FileText,
  File as FileIcon,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Link2,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { MediaKnowledgeFolderPickerModal } from '../media-source/MediaKnowledgeFolderPickerModal';
import type { MediaPickPayload } from '../media-source/types';
import { ReferenceImageStockPicker } from '../schema-form/ReferenceImageStockPicker';
import {
  displayNameFromAudioUrl,
} from './voiceoverAudioUtils';
import {
  normalizeUploadedMediaUrl,
  uploadAssets,
  type StockImageItem,
} from '../../api/client';
import '../schema-form/reference-images.css';
import '../media-source/unified-media-source.css';
import './text-file-or-paste-field.css';
import './media-upload-field.css';

export type MediaUploadMode = 'image' | 'file' | 'audio' | 'document';

export type MediaUploadFieldProps = {
  value?: string;
  onChange: (url: string) => void;
  mode: MediaUploadMode;
  /** override accept（HTML input accept 字符串），缺省按 mode 自动推断 */
  accept?: string;
  /**
   * 启用「免费素材库」等库入口（仅 image）。
   * 已上传管理已并入「我的资源」弹窗，不再单独露出按钮。
   */
  enableLibrary?: boolean;
  /** 启用「我的资源」入口（知识库 + 已上传管理） */
  enableKnowledgeFolder?: boolean;
  formTaskId?: string;
  /** 上传时的 purpose（缺省按 mode 推断：image/file/document=reference、audio=voiceover） */
  uploadPurpose?: string;
  /** [仅 audio mode] 从知识库选软链时回调，告知上游 task_id；移除音频时回调 null */
  onSourceTaskIdChange?: (taskId: string | null) => void;
  /** [仅 audio mode] 上传 / 链接完成后探测时长（秒），供表单写入 audio_duration_seconds */
  onDurationHint?: (seconds: number | null) => void;
};

const MODE_ACCEPT: Record<MediaUploadMode, string> = {
  image: 'image/*',
  file: '*/*',
  audio: 'audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.webm',
  document: '.pdf,.md,.markdown,.txt,.doc,.docx,.rtf,application/pdf,text/plain,text/markdown',
};

const MODE_PURPOSE: Record<MediaUploadMode, string> = {
  image: 'reference',
  file: 'reference',
  audio: 'voiceover',
  document: 'reference',
};

/** 仅控制主面板：上传框 vs URL；我的资源 / 图库走 Modal */
type PanelTab = 'upload' | 'link';

function isAcceptedByMode(file: File, mode: MediaUploadMode): boolean {
  if (mode === 'file') return true;
  if (mode === 'image') return file.type.startsWith('image/');
  if (mode === 'audio') {
    if (file.type.startsWith('audio/')) return true;
    return /\.(mp3|m4a|wav|aac|ogg|flac|webm)$/i.test(file.name);
  }
  if (mode === 'document') {
    if (file.type.startsWith('text/') || file.type === 'application/pdf') return true;
    return /\.(pdf|md|markdown|txt|doc|docx|rtf)$/i.test(file.name);
  }
  return false;
}

function pickerAcceptForMode(mode: MediaUploadMode): 'visual' | 'audio' | 'document' {
  if (mode === 'audio') return 'audio';
  if (mode === 'document' || mode === 'file') return 'document';
  return 'visual';
}

export function MediaUploadField({
  value = '',
  onChange,
  mode,
  accept,
  enableLibrary = false,
  enableKnowledgeFolder = true,
  formTaskId,
  uploadPurpose,
  onSourceTaskIdChange,
  onDurationHint,
}: MediaUploadFieldProps) {
  const { message } = App.useApp();
  const acceptAttr = accept && accept.trim() ? accept : MODE_ACCEPT[mode];
  const purpose = uploadPurpose && uploadPurpose.trim() ? uploadPurpose : MODE_PURPOSE[mode];

  const supportsStock = enableLibrary && mode === 'image';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const base64InputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const currentUrl = typeof value === 'string' ? value.trim() : '';
  const hasValue = !!currentUrl;

  const probeDuration = (url: string): Promise<number | null> =>
    new Promise((resolve) => {
      if (mode !== 'audio') return resolve(null);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      audio.onloadedmetadata = () => {
        const d = Number.isFinite(audio.duration) ? audio.duration : null;
        resolve(d && d > 0 ? Math.round(d * 100) / 100 : null);
      };
      audio.onerror = () => resolve(null);
    });

  const doUpload = useCallback(
    async (file: File) => {
      if (!isAcceptedByMode(file, mode)) {
        message.warning(`当前模式不支持该文件类型（${mode}）`);
        return;
      }
      setUploading(true);
      try {
        const res = await uploadAssets(file, {
          storageMode: 'asset',
          purpose,
          taskId: formTaskId,
        });
        const url = res.data?.data?.url;
        if (!url) throw new Error(res.error || '上传失败');
        const normalized = normalizeUploadedMediaUrl(url);
        onChange(normalized);
        if (mode === 'audio') {
          onSourceTaskIdChange?.(null);
          const dur = await probeDuration(normalized);
          onDurationHint?.(dur);
        }
        message.success('上传成功');
        setActiveTab('upload');
      } catch (e) {
        message.error(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [mode, message, onChange, onSourceTaskIdChange, onDurationHint, purpose, formTaskId]
  );

  const triggerFileInput = useCallback(() => {
    if (uploading) return;
    fileInputRef.current?.click();
  }, [uploading]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void doUpload(file);
    },
    [doUpload]
  );

  const fileToDataUri = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.onload = () => {
        const res = reader.result;
        if (typeof res === 'string' && res.startsWith('data:')) resolve(res);
        else reject(new Error('Base64 转换失败'));
      };
      reader.readAsDataURL(file);
    });

  const onBase64 = useCallback(
    async (file: File) => {
      try {
        const dataUri = await fileToDataUri(file);
        onChange(dataUri);
        message.success('已写入为 Base64');
      } catch (e) {
        message.error(e instanceof Error ? e.message : '转换失败');
      } finally {
        if (base64InputRef.current) base64InputRef.current.value = '';
      }
    },
    [onChange, message]
  );

  const applyPickedUrl = useCallback(
    (url: string, label?: string, sourceTaskId?: string | null) => {
      const normalized = normalizeUploadedMediaUrl(url);
      if (!normalized.trim()) {
        message.error('所选素材缺少可用地址');
        return;
      }
      onChange(normalized);
      if (mode === 'audio') {
        onSourceTaskIdChange?.(sourceTaskId ?? null);
        void probeDuration(normalized).then((d) => onDurationHint?.(d));
      }
      message.success(`已选择：${label ?? '素材'}`);
      setActiveTab('upload');
    },
    [onChange, onSourceTaskIdChange, onDurationHint, message, mode]
  );

  const handleResourcePick = useCallback(
    (item: MediaPickPayload) => {
      applyPickedUrl(item.content, item.sourceLabel, item.sourceTaskId ?? null);
    },
    [applyPickedUrl]
  );

  const handleStockPick = useCallback(
    (item: StockImageItem) => {
      const normalized = normalizeUploadedMediaUrl(item.imageUrl);
      if (!normalized.trim()) {
        message.error('所选素材缺少可用地址');
        return;
      }
      onChange(normalized);
      setActiveTab('upload');
    },
    [onChange, message]
  );

  const renderPreview = () => {
    if (!hasValue) return null;
    const isDataUri = currentUrl.startsWith('data:');

    if (mode === 'image') {
      return (
        <div className="media-upload__preview media-upload__preview--image">
          <img
            src={currentUrl}
            alt="预览"
            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4 }}
          />
        </div>
      );
    }
    if (mode === 'audio') {
      return (
        <div className="media-upload__preview media-upload__preview--audio">
          <Space align="center" style={{ width: '100%' }} size={8}>
            <FileAudio size={18} />
            <audio src={currentUrl} controls preload="metadata" style={{ maxWidth: 360, flex: 1 }} />
          </Space>
        </div>
      );
    }
    if (mode === 'document') {
      const label = displayNameFromAudioUrl(currentUrl) || '文档';
      return (
        <div className="media-upload__preview media-upload__preview--document">
          <Space>
            <FileText size={18} />
            <Typography.Text>{label}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {isDataUri ? 'Base64 内嵌' : 'URL 引用'}
            </Typography.Text>
          </Space>
        </div>
      );
    }
    const label = displayNameFromAudioUrl(currentUrl) || '文件';
    return (
      <div className="media-upload__preview media-upload__preview--file">
        <Space>
          <FileIcon size={18} />
          <Typography.Text>{label}</Typography.Text>
        </Space>
      </div>
    );
  };

  const renderUploadDropzone = () => {
    const DropzoneIcon =
      mode === 'image'
        ? ImageIcon
        : mode === 'audio'
          ? FileAudio
          : mode === 'document'
            ? FileText
            : FileIcon;
    const hint =
      mode === 'image'
        ? '点击或拖拽图片到此处上传'
        : mode === 'audio'
          ? '点击或拖拽音频到此处上传'
          : mode === 'document'
            ? '点击或拖拽文档（PDF/MD/TXT/DOCX）到此处上传'
            : '点击或拖拽文件到此处上传';
    return (
      <div
        className={`ref-images__dropzone ref-images__dropzone--initial${isDragging ? ' ref-images__dropzone--drag' : ''}`}
        style={{ cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1, padding: '32px 16px' }}
        onClick={triggerFileInput}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <DropzoneIcon size={28} style={{ opacity: 0.55, marginBottom: 8 }} />
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {uploading ? '上传中…' : isDragging ? '松开以上传' : hint}
        </Typography.Text>
      </div>
    );
  };

  const renderActivePanel = () => {
    if (activeTab === 'link') {
      return (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Input
            placeholder="粘贴 http(s):// 或 /api/v1/media/... 地址"
            value={currentUrl.startsWith('data:') ? '' : currentUrl}
            onChange={(e) => {
              const url = e.target.value.trim();
              onChange(url);
              if (mode === 'audio') {
                onSourceTaskIdChange?.(null);
                if (url.startsWith('http') || url.startsWith('/')) {
                  void probeDuration(normalizeUploadedMediaUrl(url)).then((d) => onDurationHint?.(d));
                }
              }
            }}
            allowClear={!!currentUrl}
            size="large"
            autoFocus
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            支持 http(s):// 完整 URL，或 /api/v1/media/public/... 代理路径。
          </Typography.Text>
        </Space>
      );
    }
    return renderUploadDropzone();
  };

  return (
    <div className="text-file-or-paste ref-images__body">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doUpload(f);
        }}
      />

      <div className="ref-images__source-bar">
        <div className="ref-images__source-tabs" role="tablist" aria-label="上传方式">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            className={`ref-images__source-tab${activeTab === 'upload' ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <UploadIcon size={15} />
            拖拽 / 上传
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'link'}
            className={`ref-images__source-tab${activeTab === 'link' ? ' ref-images__source-tab--active' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            <Link2 size={15} />
            粘贴 URL
          </button>
          {supportsStock ? (
            <button
              type="button"
              className="ref-images__source-tab"
              onClick={() => setStockOpen(true)}
            >
              <Globe size={15} />
              免费素材库
            </button>
          ) : null}
          {enableKnowledgeFolder ? (
            <button
              type="button"
              className="ref-images__source-tab"
              onClick={() => setResourcesOpen(true)}
            >
              <FolderOpen size={15} />
              我的资源
            </button>
          ) : null}
        </div>
      </div>

      {hasValue ? (
        <div className="text-file-or-paste__panel">
          {renderPreview()}
          <Space size={8} wrap>
            <button
              type="button"
              className="ref-images__source-tab"
              style={{ color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.4)' }}
              onClick={() => {
                onChange('');
                if (mode === 'audio') {
                  onSourceTaskIdChange?.(null);
                  onDurationHint?.(null);
                }
              }}
            >
              <Trash2 size={15} />
              清除
            </button>
          </Space>
        </div>
      ) : (
        <div className="text-file-or-paste__panel">{renderActivePanel()}</div>
      )}

      {mode === 'image' && !hasValue ? (
        <div className="text-file-or-paste__panel">
          <input
            ref={base64InputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onBase64(f);
            }}
          />
          <button
            type="button"
            className="ref-images__source-tab"
            onClick={() => base64InputRef.current?.click()}
            style={{ alignSelf: 'flex-start' }}
          >
            <ImageIcon size={15} />
            上传为 Base64（小图内嵌）
          </button>
        </div>
      ) : null}

      {supportsStock ? (
        <ReferenceImageStockPicker
          open={stockOpen}
          onClose={() => setStockOpen(false)}
          onSelect={handleStockPick}
        />
      ) : null}

      {enableKnowledgeFolder ? (
        <MediaKnowledgeFolderPickerModal
          open={resourcesOpen}
          onClose={() => setResourcesOpen(false)}
          accept={pickerAcceptForMode(mode)}
          enableMyUploads
          documentPickMode={mode === 'document' || mode === 'file' ? 'url' : 'text'}
          pickSuccessMessage=""
          onPick={handleResourcePick}
        />
      ) : null}
    </div>
  );
}
