import { useState, useEffect, useCallback, useMemo } from 'react';
import { notification, Modal, Input, Select, Tag, Empty, Spin, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  listCharacters,
  listWritingTasks,
  listOutlineTasks,
  listCgiTasks,
  deleteTask,
  getMediaGraph,
  getMediaWriting,
  getMediaAudio,
  getMediaVideo,
  type CharacterItem,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { normalizeUrl, toRelativeMediaUrl } from '../utils/url';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AssetType = 'character' | 'outline' | 'writing' | 'graph' | 'audio' | 'music' | 'video' | 'smartflow';

export type AssetStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface UnifiedAsset {
  id: string;
  type: AssetType;
  title: string;
  description?: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  /** Internal: raw task for operations like delete */
  _task?: WritingTaskItem;
  _character?: CharacterItem;
  /** Jump target */
  _pageType?: AssetType;
  metadata?: Record<string, unknown>;
}

export interface VirtualFolder {
  id: string;
  name: string;
  description?: string;
  assetIds: string[];
  createdAt: string;
  updatedAt: string;
}

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  character: '角色',
  outline: '大纲',
  writing: '写作',
  graph: '图片',
  audio: '音频',
  music: '音乐',
  video: '视频',
  smartflow: 'Smartflow',
};

// Muted/low-saturation palette —简约风格，参考 Notion/Linear
const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  character: '#64748b',   // slate-500 (was #8b5cf6 高饱和紫)
  outline:   '#3b82f6',   // blue-500
  writing:   '#10b981',   // emerald-500
  graph:     '#f59e0b',   // amber-500
  audio:     '#475569',   // slate-600 (was #06b6d4 亮青)
  music:     '#78716c',   // stone-500 (was #ec4899 高饱和粉)
  video:     '#94a3b8',   // slate-400 (was #ef4444 亮红)
  smartflow: '#6366f1',   // indigo-500
};

const STATUS_COLORS: Record<AssetStatus, string> = {
  pending: '#94a3b8',
  queued: '#60a5fa',
  processing: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

// ─── Virtual Folder Storage (localStorage) ───────────────────────────────────

const VF_STORAGE_KEY = 'mxm_virtual_folders';

function loadVirtualFolders(): VirtualFolder[] {
  try {
    const raw = localStorage.getItem(VF_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VirtualFolder[]) : [];
  } catch {
    return [];
  }
}

function saveVirtualFolders(folders: VirtualFolder[]) {
  localStorage.setItem(VF_STORAGE_KEY, JSON.stringify(folders));
}

// ─── Preview Modal ───────────────────────────────────────────────────────────

interface PreviewModalProps {
  asset: UnifiedAsset;
  onClose: () => void;
}

function AssetPreviewModal({ asset, onClose }: PreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (!asset.previewUrl && !asset._task) return;
    loadPreview();
  }, [asset]);

  const loadPreview = async () => {
    if (!asset._task) return;
    setLoading(true);
    try {
      if (asset.type === 'graph') {
        const res = await getMediaGraph(asset.id);
        const d = (res.data as { data?: { images?: string[]; url?: string } })?.data;
        setContent(d?.images?.[0] || d?.url || null);
      } else if (asset.type === 'video') {
        const res = await getMediaVideo(asset.id);
        const d = (res.data as { data?: { video_url?: string; url?: string } })?.data;
        setContent(d?.video_url || d?.url || null);
      } else if (asset.type === 'writing') {
        const res = await getMediaWriting(asset.id);
        const d = (res.data as { data?: { text?: string } })?.data;
        setContent(d?.text || null);
      } else if (asset.type === 'audio' || asset.type === 'music') {
        const res = await getMediaAudio(asset.id);
        const d = (res.data as { data?: { audio_url?: string; url?: string } })?.data;
        setContent(d?.audio_url || d?.url || null);
      } else {
        setContent(null);
      }
    } catch {
      setContent(null);
    } finally {
      setLoading(false);
    }
  };

  const jumpPage = () => {
    const map: Partial<Record<AssetType, string>> = {
      character: 'characters',
      outline: 'outline',
      writing: 'writing',
      graph: 'graph',
      audio: 'audio',
      music: 'music',
      video: 'video',
      smartflow: 'smartflow',
    };
    const page = map[asset.type];
    if (page) {
      (window as Window & { __setPage?: (id: string) => void }).__setPage?.(page);
      onClose();
    }
  };

  return (
    <div className="asset-preview-overlay" onClick={onClose}>
      <div className="asset-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="asset-preview-header">
          <div className="asset-preview-title-row">
            <Tag color={ASSET_TYPE_COLORS[asset.type]}>{ASSET_TYPE_LABELS[asset.type]}</Tag>
            <span className="asset-preview-title">{asset.title || '未命名'}</span>
          </div>
          <div className="asset-preview-actions">
            <button className="btn-secondary btn-small" onClick={jumpPage}>跳转查看</button>
            <button className="asset-preview-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="asset-preview-body">
          {loading ? (
            <div className="asset-preview-loading"><Spin /></div>
          ) : asset.thumbnailUrl || content ? (
            asset.type === 'graph' && content ? (
              <div className="asset-preview-image-wrap">
                <img src={toRelativeMediaUrl(normalizeUrl(content) || content)} alt="" className="asset-preview-image" referrerPolicy="no-referrer" />
              </div>
            ) : asset.type === 'video' && content ? (
              <div className="asset-preview-video-wrap">
                <video src={toRelativeMediaUrl(normalizeUrl(content) || content)} controls className="asset-preview-video" />
              </div>
            ) : asset.type === 'audio' || asset.type === 'music' ? (
              <div className="asset-preview-audio-wrap">
                {content ? (
                  <audio src={toRelativeMediaUrl(normalizeUrl(content) || content)} controls className="asset-preview-audio" />
                ) : (
                  <p className="muted">暂无预览</p>
                )}
              </div>
            ) : content ? (
              <div className="asset-preview-text">
                <pre>{content.slice(0, 500)}{content.length > 500 ? '…' : ''}</pre>
              </div>
            ) : asset.thumbnailUrl ? (
              <img src={asset.thumbnailUrl} alt="" className="asset-preview-image" referrerPolicy="no-referrer" />
            ) : (
              <p className="muted">暂无预览</p>
            )
          ) : (
            <p className="muted">暂无预览内容</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

interface AssetCardProps {
  asset: UnifiedAsset;
  onPreview: (asset: UnifiedAsset) => void;
  onDelete: (asset: UnifiedAsset) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  selectionMode: boolean;
  isInFolder: boolean;
  onAddToFolder: (asset: UnifiedAsset) => void;
}

// ─── Sortable Asset Card ─────────────────────────────────────────────────────

interface SortableAssetCardProps extends AssetCardProps {
  isDraggable: boolean;
}

// ─── Type icons (emoji, consistent) ──────────────────────────────────────────
const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  character: '👤',
  outline:   '📋',
  writing:   '✏️',
  graph:     '🖼️',
  audio:     '🔊',
  music:     '🎵',
  video:     '🎬',
  smartflow: '🔗',
};

function SortableAssetCard({ asset, onPreview, onDelete, isSelected, onToggleSelect, selectionMode, isInFolder, onAddToFolder, isDraggable }: SortableAssetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const cardMenu: MenuProps['items'] = [
    { key: 'preview', label: '预览', onClick: () => onPreview(asset) },
    { key: 'addFolder', label: '加入文件夹', onClick: () => onAddToFolder(asset) },
    { type: 'divider' },
    { key: 'delete', label: '删除', danger: true, onClick: () => onDelete(asset) },
  ];

  // Rich placeholder: icon + type name + title preview (no single-char)
  const typeColor = ASSET_TYPE_COLORS[asset.type];
  const isProcessing = asset.status === 'processing' || asset.status === 'queued';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'asset-card',
        isSelected ? 'asset-card-selected' : '',
        isInFolder ? 'asset-card-in-folder' : '',
        isDragging ? 'asset-card-dragging' : '',
        isDraggable ? 'asset-card-draggable' : '',
        isProcessing ? 'asset-card--processing' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => selectionMode ? onToggleSelect(asset.id) : onPreview(asset)}
      {...attributes}
    >
      {/* Checkbox in selection mode */}
      {selectionMode && (
        <div className="asset-card-checkbox">
          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(asset.id)} />
        </div>
      )}

      {/* Thumbnail */}
      <div className="asset-card-thumb-wrap">
        {asset.thumbnailUrl ? (
          <AuthImage
            src={asset.thumbnailUrl}
            alt=""
            className="asset-card-thumb"
            referrerPolicy="no-referrer"
            fallback={<div className="asset-card-thumb-placeholder" style={{ background: `${typeColor}20` }}>
              <span className="asset-card-placeholder-icon" style={{ color: typeColor }}>{ASSET_TYPE_ICONS[asset.type]}</span>
              <span className="asset-card-placeholder-label" style={{ color: typeColor }}>{ASSET_TYPE_LABELS[asset.type]}</span>
            </div>}
          />
        ) : (
          <div className="asset-card-thumb-placeholder asset-card-thumb-placeholder--rich" style={{ background: `${typeColor}18` }}>
            <span className="asset-card-placeholder-icon" style={{ color: typeColor }}>{ASSET_TYPE_ICONS[asset.type]}</span>
            <span className="asset-card-placeholder-label" style={{ color: typeColor }}>{ASSET_TYPE_LABELS[asset.type]}</span>
            {asset.title && (
              <span className="asset-card-placeholder-title">
                {asset.title.slice(0, 10)}{asset.title.length > 10 ? '…' : ''}
              </span>
            )}
          </div>
        )}
        {/* Gradient overlay for text readability */}
        <div className="asset-card-thumb-overlay" />
        {/* Floating type badge */}
        <div className="asset-card-type-badge" style={{ background: `${typeColor}cc`, color: '#fff' }}>
          {ASSET_TYPE_LABELS[asset.type]}
        </div>
        {/* Processing shimmer indicator */}
        {isProcessing && <div className="asset-card-processing-bar" />}
        {/* Drag handle */}
        {isDraggable && (
          <div
            className="asset-card-drag-handle"
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            title="拖拽排序"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/>
              <circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/>
              <circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/>
            </svg>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="asset-card-body">
        {/* Always show title — use '未命名' fallback, not empty */}
        <div className="asset-card-title" title={asset.title || '未命名'}>
          {asset.title || '未命名'}
        </div>
        <div className="asset-card-footer">
          <div className={`asset-card-status asset-card-status--${asset.status}`}>
            <span className="asset-card-status-dot" style={{ background: STATUS_COLORS[asset.status] }} />
            {STATUS_LABELS[asset.status]}
          </div>
          <div className="asset-card-date">
            {new Date(asset.updatedAt || asset.createdAt).toLocaleDateString('zh-CN')}
          </div>
        </div>
      </div>

      {/* Actions menu */}
      <div className="asset-card-actions" onClick={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items: cardMenu }} trigger={['click']} placement="bottomRight">
          <button className="asset-card-menu-btn" tabIndex={-1}>⋮</button>
        </Dropdown>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VirtualFolder() {
  // ── DnD sensors (inside component — React hooks must be called here) ──
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const { isLoggedIn } = useAuth();

  // ── Data ──
  const [assets, setAssets] = useState<UnifiedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Virtual Folders ──
  const [virtualFolders, setVirtualFolders] = useState<VirtualFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');

  // ── Filters ──
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState<AssetType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<AssetStatus | 'all'>('all');
  const [filterTimeRange, setFilterTimeRange] = useState<'all' | '7d' | '30d' | '90d'>('all');

  // ── Selection ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addToFolderModalAsset, setAddToFolderModalAsset] = useState<UnifiedAsset | null>(null);

  // ── Preview ──
  const [previewAsset, setPreviewAsset] = useState<UnifiedAsset | null>(null);

  // ── Load virtual folders from localStorage ──
  useEffect(() => {
    setVirtualFolders(loadVirtualFolders());
  }, []);

  // ── Load all assets ──
  const loadAssets = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    const all: UnifiedAsset[] = [];

    try {
      // Characters
      try {
        const chars = await listCharacters({ limit: 100 });
        const list = (chars.data as { data?: { characters?: CharacterItem[] } })?.data?.characters ?? [];
        for (const c of Array.isArray(list) ? list : []) {
          const avatar = resolveCharacterAvatar(c);
          all.push({
            id: c.id,
            type: 'character',
            title: c.name || '未命名角色',
            description: c.description as string,
            status: 'completed',
            createdAt: c.created_at || new Date().toISOString(),
            updatedAt: c.updated_at,
            thumbnailUrl: avatar,
            _character: c,
            _pageType: 'character',
          });
        }
      } catch { /* skip */ }

      // Writing tasks
      try {
        const res = await listWritingTasks({ limit: 50 });
        console.warn('[VirtualFolder] listWritingTasks response:', JSON.stringify(res.data));
        const tasks = (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? [];
        for (const t of tasks) {
          const title = getTaskTitle(t);
          const thumb = getTaskThumbnail(t);
          all.push({
            id: t.id,
            type: 'writing',
            title,
            status: t.status as AssetStatus,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.updatedAt,
            thumbnailUrl: thumb,
            _task: t,
            _pageType: 'writing',
            metadata: t.metadata,
          });
        }
      } catch { /* skip */ }

      // Outline tasks
      try {
        const res = await listOutlineTasks({ limit: 50 });
        console.warn('[VirtualFolder] listOutlineTasks response:', JSON.stringify(res.data));
        const tasks = (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? [];
        for (const t of tasks) {
          all.push({
            id: t.id,
            type: 'outline',
            title: getTaskTitle(t),
            status: t.status as AssetStatus,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.updatedAt,
            _task: t,
            _pageType: 'outline',
            metadata: t.metadata,
          });
        }
      } catch { /* skip */ }

      // Graph tasks (type='image' in backend TaskType)
      try {
        const res = await listCgiTasks({ type: 'image', limit: 50 });
        console.warn('[VirtualFolder] listCgiTasks(image) response:', JSON.stringify(res.data));
        const tasks = (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? [];
        for (const t of tasks) {
          all.push({
            id: t.id,
            type: 'graph',
            title: getTaskTitle(t),
            status: t.status as AssetStatus,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.updatedAt,
            _task: t,
            _pageType: 'graph',
            metadata: t.metadata,
          });
        }
      } catch { /* skip */ }

      // Audio tasks
      try {
        const res = await listCgiTasks({ type: 'audio', limit: 50 });
        console.warn('[VirtualFolder] listCgiTasks(audio) response:', JSON.stringify(res.data));
        for (const t of (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? []) {
          all.push({
            id: t.id,
            type: 'audio',
            title: getTaskTitle(t),
            status: t.status as AssetStatus,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.updatedAt,
            _task: t,
            _pageType: 'audio',
            metadata: t.metadata,
          });
        }
      } catch { /* skip */ }

      // Music tasks
      try {
        const res = await listCgiTasks({ type: 'music', limit: 50 });
        console.warn('[VirtualFolder] listCgiTasks(music) response:', JSON.stringify(res.data));
        for (const t of (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? []) {
          all.push({
            id: t.id,
            type: 'music',
            title: getTaskTitle(t),
            status: t.status as AssetStatus,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.updatedAt,
            _task: t,
            _pageType: 'music',
            metadata: t.metadata,
          });
        }
      } catch { /* skip */ }

      // Video tasks
      try {
        const res = await listCgiTasks({ type: 'video', limit: 50 });
        console.warn('[VirtualFolder] listCgiTasks(video) response:', JSON.stringify(res.data));
        for (const t of (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? []) {
          all.push({
            id: t.id,
            type: 'video',
            title: getTaskTitle(t),
            status: t.status as AssetStatus,
            createdAt: t.createdAt || new Date().toISOString(),
            updatedAt: t.updatedAt,
            _task: t,
            _pageType: 'video',
            metadata: t.metadata,
          });
        }
      } catch { /* skip */ }

    } finally {
      setLoading(false);
    }

    // Sort by createdAt desc
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setAssets(all);
  }, [isLoggedIn, refreshKey]);

  useEffect(() => {
    if (isLoggedIn) loadAssets();
  }, [isLoggedIn, loadAssets]);

  // ── Filtered assets ──
  const displayedAssets = useMemo(() => {
    let list = assets;

    // Folder filter
    if (selectedFolderId) {
      const folder = virtualFolders.find((f) => f.id === selectedFolderId);
      if (folder) {
        list = list.filter((a) => folder.assetIds.includes(a.id));
      }
    }

    // Keyword
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      );
    }

    // Type
    if (filterType !== 'all') {
      list = list.filter((a) => a.type === filterType);
    }

    // Status
    if (filterStatus !== 'all') {
      list = list.filter((a) => a.status === filterStatus);
    }

    // Time range
    if (filterTimeRange !== 'all') {
      const now = Date.now();
      const ranges: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
      const days = ranges[filterTimeRange];
      if (days) {
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        list = list.filter((a) => new Date(a.createdAt).getTime() >= cutoff);
      }
    }

    return list;
  }, [assets, selectedFolderId, searchKeyword, filterType, filterStatus, filterTimeRange, virtualFolders]);

  // ── Selection ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchAddToFolder = () => {
    if (selectedIds.size === 0) return;
    // Open first selected for add-to-folder modal (reuse single-asset modal)
    const first = assets.find((a) => a.id === [...selectedIds][0]);
    if (first) setAddToFolderModalAsset(first);
  };

  // ── Virtual Folder operations ──
  const createFolder = () => {
    if (!newFolderName.trim()) return;
    const folder: VirtualFolder = {
      id: `vf_${Date.now()}`,
      name: newFolderName.trim(),
      description: newFolderDesc.trim() || undefined,
      assetIds: [...selectedIds],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...virtualFolders, folder];
    setVirtualFolders(updated);
    saveVirtualFolders(updated);
    setCreateFolderModalOpen(false);
    setNewFolderName('');
    setNewFolderDesc('');
    setSelectedIds(new Set());
    setSelectionMode(false);
    notification.success({ message: '文件夹已创建', placement: 'top' });
  };

  const deleteFolder = (folderId: string) => {
    if (!window.confirm('确定删除该文件夹？')) return;
    const updated = virtualFolders.filter((f) => f.id !== folderId);
    setVirtualFolders(updated);
    saveVirtualFolders(updated);
    if (selectedFolderId === folderId) setSelectedFolderId(null);
  };

  const addAssetToFolder = (asset: UnifiedAsset) => {
    setAddToFolderModalAsset(asset);
  };

  const confirmAddToFolder = (folderId: string) => {
    if (!addToFolderModalAsset) return;
    const folder = virtualFolders.find((f) => f.id === folderId);
    if (!folder) return;
    if (folder.assetIds.includes(addToFolderModalAsset.id)) {
      notification.info({ message: '该资产已在文件夹中', placement: 'top' });
      setAddToFolderModalAsset(null);
      return;
    }
    const updated = virtualFolders.map((f) =>
      f.id === folderId
        ? { ...f, assetIds: [...f.assetIds, addToFolderModalAsset.id], updatedAt: new Date().toISOString() }
        : f
    );
    setVirtualFolders(updated);
    saveVirtualFolders(updated);
    notification.success({ message: `已加入「${folder.name}」`, placement: 'top' });
    setAddToFolderModalAsset(null);
  };

  // ── Asset operations ──
  const handleDeleteAsset = async (asset: UnifiedAsset) => {
    if (!window.confirm(`确定删除「${asset.title}」？此操作不可恢复。`)) return;
    if (asset._character) {
      const { deleteCharacter } = await import('../api/client');
      await deleteCharacter(asset.id);
    } else if (asset._task) {
      await deleteTask(asset.id);
    }
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    notification.success({ message: '已删除', placement: 'top' });
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const a of assets) {
      byType[a.type] = (byType[a.type] || 0) + 1;
    }
    return byType;
  }, [assets]);

  // ── DnD: handle folder asset reordering ──
  const isInFolderView = selectedFolderId !== null;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedFolderId) return;

    const folder = virtualFolders.find((f) => f.id === selectedFolderId);
    if (!folder) return;

    const oldIndex = folder.assetIds.indexOf(String(active.id));
    const newIndex = folder.assetIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newAssetIds = arrayMove([...folder.assetIds], oldIndex, newIndex);
    const updated = virtualFolders.map((f) =>
      f.id === selectedFolderId
        ? { ...f, assetIds: newAssetIds, updatedAt: new Date().toISOString() }
        : f
    );
    setVirtualFolders(updated);
    saveVirtualFolders(updated);
    notification.success({ message: '排序已更新', placement: 'top', duration: 1.5 });
  }, [selectedFolderId, virtualFolders]);

  // ── UI helpers ──
  const selectedFolder = selectedFolderId ? virtualFolders.find((f) => f.id === selectedFolderId) : null;

  return (
    <section className="page-card asset-center">
      {/* Header */}
      <div className="asset-center-header">
        <div className="asset-center-title-row">
          <h2>资产中心</h2>
          <div className="asset-center-stats">
            {Object.entries(stats).map(([type, count]) => (
              <Tag key={type} color={ASSET_TYPE_COLORS[type as AssetType]}>{ASSET_TYPE_LABELS[type as AssetType]} {count}</Tag>
            ))}
          </div>
        </div>
        <div className="asset-center-actions">
          <button className="btn-secondary btn-small" onClick={() => { setRefreshKey((k) => k + 1); }} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
          <button
            className={`btn-secondary btn-small ${selectionMode ? 'btn-active' : ''}`}
            onClick={() => { setSelectionMode((m) => !m); if (selectionMode) setSelectedIds(new Set()); }}
          >
            {selectionMode ? '取消选择' : '多选'}
          </button>
          {selectionMode && selectedIds.size > 0 && (
            <>
              <span className="asset-selected-count">已选 {selectedIds.size} 项</span>
              <button className="btn-secondary btn-small" onClick={handleBatchAddToFolder}>加入文件夹</button>
              <button className="btn-secondary btn-small" onClick={() => setCreateFolderModalOpen(true)}>新建文件夹</button>
            </>
          )}
        </div>
      </div>

      <div className="asset-center-layout">
        {/* Sidebar: Virtual Folders */}
        <aside className="asset-center-sidebar">
          <div className="asset-sidebar-section">
            <div className="asset-sidebar-header">
              <span>文件夹</span>
              <button className="btn-link" onClick={() => setCreateFolderModalOpen(true)}>+ 新建</button>
            </div>
            <ul className="asset-folder-list">
              <li
                className={`asset-folder-item ${selectedFolderId === null ? 'active' : ''}`}
                onClick={() => setSelectedFolderId(null)}
              >
                <span className="asset-folder-icon">📁</span>
                <span className="asset-folder-name">全部资产</span>
                <span className="asset-folder-count">{assets.length}</span>
              </li>
              {virtualFolders.map((f) => {
                const count = f.assetIds.length;
                return (
                  <li key={f.id} className={`asset-folder-item ${selectedFolderId === f.id ? 'active' : ''}`}>
                    <span className="asset-folder-icon" onClick={() => setSelectedFolderId(f.id)}>📂</span>
                    <span className="asset-folder-name" onClick={() => setSelectedFolderId(f.id)}>{f.name}</span>
                    <div className="asset-folder-actions">
                      <span className="asset-folder-count">{count}</span>
                      <button className="asset-folder-delete" onClick={() => deleteFolder(f.id)} title="删除文件夹">×</button>
                    </div>
                  </li>
                );
              })}
              {virtualFolders.length === 0 && (
                <li className="asset-folder-empty">暂无文件夹</li>
              )}
            </ul>
          </div>
        </aside>

        {/* Main: Asset Grid */}
        <div className="asset-center-main">
          {/* Filters */}
          <div className="asset-filters">
            <Input
              placeholder="搜索资产名称、描述、ID…"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
            <Select
              value={filterType}
              onChange={(v) => setFilterType(v)}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: '全部类型' },
                ...Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
            <Select
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: '全部状态' },
                ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
            <Select
              value={filterTimeRange}
              onChange={(v) => setFilterTimeRange(v)}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: '全部时间' },
                { value: '7d', label: '近7天' },
                { value: '30d', label: '近30天' },
                { value: '90d', label: '近90天' },
              ]}
            />
          </div>

          {/* Selected Folder Info */}
          {selectedFolder && (
            <div className="asset-folder-info-bar">
              <span>📂 <strong>{selectedFolder.name}</strong></span>
              {selectedFolder.description && <span className="muted"> — {selectedFolder.description}</span>}
              <span className="muted"> · {selectedFolder.assetIds.length} 项资产</span>
              {selectedFolder.assetIds.length === 0 && (
                <span className="muted">（空文件夹）</span>
              )}
            </div>
          )}

          {/* Asset Grid (DnD sortable when in folder view) */}
          {!isLoggedIn ? (
            <div className="asset-center-empty"><p className="muted">请先登录。</p></div>
          ) : loading && assets.length === 0 ? (
            <div className="asset-center-empty"><Spin tip="加载资产中…" /></div>
          ) : displayedAssets.length === 0 ? (
            <div className="asset-center-empty">
              <Empty description={searchKeyword || filterType !== 'all' || filterStatus !== 'all' ? '无匹配资产' : '暂无资产'} />
            </div>
          ) : isInFolderView ? (
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={displayedAssets.map((a) => a.id)} strategy={rectSortingStrategy}>
                <div className="asset-grid">
                  {displayedAssets.map((asset) => (
                    <SortableAssetCard
                      key={asset.id}
                      asset={asset}
                      onPreview={setPreviewAsset}
                      onDelete={handleDeleteAsset}
                      isSelected={selectedIds.has(asset.id)}
                      onToggleSelect={toggleSelect}
                      selectionMode={selectionMode}
                      isInFolder={selectedFolder?.assetIds.includes(asset.id) ?? false}
                      onAddToFolder={addAssetToFolder}
                      isDraggable={true}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="asset-grid">
              {displayedAssets.map((asset) => (
                <SortableAssetCard
                  key={asset.id}
                  asset={asset}
                  onPreview={setPreviewAsset}
                  onDelete={handleDeleteAsset}
                  isSelected={selectedIds.has(asset.id)}
                  onToggleSelect={toggleSelect}
                  selectionMode={selectionMode}
                  isInFolder={selectedFolder?.assetIds.includes(asset.id) ?? false}
                  onAddToFolder={addAssetToFolder}
                  isDraggable={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewAsset && (
        <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}

      {/* Create Folder Modal */}
      <Modal
        title="新建文件夹"
        open={createFolderModalOpen}
        onOk={createFolder}
        onCancel={() => setCreateFolderModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>文件夹名称 *</label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="例如：我的收藏"
              maxLength={50}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>描述（可选）</label>
            <Input.TextArea
              value={newFolderDesc}
              onChange={(e) => setNewFolderDesc(e.target.value)}
              placeholder="文件夹说明…"
              rows={2}
              maxLength={200}
            />
          </div>
          {selectionMode && selectedIds.size > 0 && (
            <p className="muted">将同时把 {selectedIds.size} 项已选资产加入该文件夹。</p>
          )}
        </div>
      </Modal>

      {/* Add to Folder Modal */}
      <Modal
        title="加入文件夹"
        open={!!addToFolderModalAsset}
        onCancel={() => setAddToFolderModalAsset(null)}
        footer={null}
      >
        <p style={{ marginBottom: 12 }}>
          将「<strong>{addToFolderModalAsset?.title}</strong>」加入：
        </p>
        {virtualFolders.length === 0 ? (
          <p className="muted">暂无文件夹，请先创建。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {virtualFolders.map((f) => (
              <div key={f.id} className="asset-folder-select-item">
                <span>📂 {f.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{f.assetIds.length} 项</span>
                <button
                  className="btn-secondary btn-small"
                  onClick={() => confirmAddToFolder(f.id)}
                  disabled={f.assetIds.includes(addToFolderModalAsset?.id ?? '')}
                >
                  {f.assetIds.includes(addToFolderModalAsset?.id ?? '') ? '已在' : '加入'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button className="btn-link" onClick={() => { setAddToFolderModalAsset(null); setCreateFolderModalOpen(true); }}>
            + 创建新文件夹
          </button>
        </div>
      </Modal>
    </section>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveCharacterAvatar(c: CharacterItem): string | undefined {
  const mediaUrls = c.mediaUrls as { avatar?: string } | undefined;
  if (mediaUrls?.avatar) return toRelativeMediaUrl(normalizeUrl(mediaUrls.avatar) || mediaUrls.avatar);
  const appearanceImgs = c.appearance?.reference_images;
  const clothingImgs = c.clothing_style?.reference_images;
  const raw =
    (appearanceImgs?.length ? appearanceImgs[0] : undefined) ??
    (clothingImgs?.length ? clothingImgs[0] : undefined);
  if (!raw) return undefined;
  const url = normalizeUrl(raw) || raw;
  const withSlash = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
  return toRelativeMediaUrl(withSlash);
}

function getTaskTitle(t: WritingTaskItem): string {
  const labelVal = (t.metadata?.label as string)?.trim() || (t.metadata?.writing_type_label as string)?.trim();
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string)?.trim() || '';
  // Prefer label; then prompt preview; then type-based default
  if (labelVal) return labelVal;
  if (promptVal.length > 0) {
    return `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`;
  }
  // Final fallback based on type
  const typeDefaults: Record<string, string> = {
    writing: '写作任务',
    outline: '大纲任务',
    graph: '图片任务',
    audio: '音频任务',
    music: '音乐任务',
    video: '视频任务',
  };
  return typeDefaults[t.type] || `${t.type} 任务`;
}

function getTaskThumbnail(t: WritingTaskItem): string | undefined {
  const meta = t.metadata as Record<string, unknown> | undefined;
  const url = meta?.thumbnail_url as string | undefined
    || meta?.cover_url as string | undefined
    || meta?.preview_url as string | undefined;
  if (url) return toRelativeMediaUrl(normalizeUrl(url) || url);
  return undefined;
}
