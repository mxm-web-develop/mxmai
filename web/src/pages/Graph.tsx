import { useState, useEffect, useCallback, useRef } from 'react';
import { notification, Switch, Drawer } from 'antd';
import {
  postGraph,
  listCgiTasks,
  getGraphFormOptions,
  uploadAssets,
  fetchAssetBlobUrl,
  deleteTask,
  fetchMediaBlobUrl,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { GraphViewerModal } from '../components/GraphViewerModal';

// 业务类型与子类型（与 mobile 对齐）
const GRAPH_TYPE_OPTIONS = [
  { value: 'photograph', label: '摄影' },
  { value: 'design', label: '设计' },
  { value: 'painting', label: '绘画' },
];

const PHOTOGRAPH_TYPES = [
  { value: 'portrait', label: '人像' },
  { value: 'landscape', label: '风景' },
  { value: 'cinematic', label: '电影画面' },
  { value: 'commercial', label: '产品商业拍摄' },
  { value: 'documentary', label: '纪事' },
];

const DESIGN_TYPES = [
  { value: '3d', label: '3D' },
  { value: 'manual', label: '使用手册' },
  { value: 'poster', label: '画报' },
  { value: 'icon', label: '图标' },
  { value: 'coverImage', label: '封面图片' },
  { value: 'ui-design', label: 'UI 设计' },
];

const PAINTING_TYPES = [
  { value: 'illustration', label: '插图' },
  { value: 'comic', label: '漫画' },
  { value: 'conceptArt', label: '原画' },
  { value: 'cartoon', label: '卡通' },
];

const TYPE_MAP: Record<string, Array<{ value: string; label: string }>> = {
  photograph: PHOTOGRAPH_TYPES,
  design: DESIGN_TYPES,
  painting: PAINTING_TYPES,
};

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
];

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

type Grid9Purpose = 'options' | 'storyboard' | 'variants' | 'character';

const GRID9_PURPOSE_OPTIONS: Array<{ value: Grid9Purpose; label: string; hint: string }> = [
  { value: 'options', label: '9 方案', hint: '同一需求给出 9 个方案/风格选项' },
  { value: 'storyboard', label: '分镜', hint: '9 张连贯镜头序列（适合电影/漫画/纪事）' },
  { value: 'variants', label: '同 set 变体', hint: '同一主题的 9 个技术/参数变体' },
  { value: 'character', label: '角色画像', hint: '同一角色的近/远、正/侧/背等多角度' },
];

type ReferenceImageType = 'main-subject' | 'background' | 'outfits' | 'color-reference' | 'style-reference';
type ReferenceImageItem = { content: string; type: ReferenceImageType; previewUrl: string };

const REFERENCE_IMAGE_TYPES: Array<{ value: ReferenceImageType; label: string }> = [
  { value: 'main-subject', label: '主体一致' },
  { value: 'background', label: '背景/光线' },
  { value: 'outfits', label: '服装/道具' },
  { value: 'color-reference', label: '色彩参考' },
  { value: 'style-reference', label: '风格参考' },
];

type FormOption = { value: string; label: string; labelEn?: string };
function normalizeFormOptions(v: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((opt) => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { value: String(opt), label: String(opt) };
      }
      if (opt && typeof opt === 'object') {
        const o = opt as Partial<FormOption> & Record<string, unknown>;
        const value = typeof o.value === 'string' ? o.value : '';
        const label =
          typeof o.label === 'string'
            ? o.label
            : typeof o.labelEn === 'string'
              ? o.labelEn
              : value;
        if (value) return { value, label: label || value };
      }
      return null;
    })
    .filter((x): x is { value: string; label: string } => Boolean(x?.value));
}

const ADVANCED_PARAM_LABELS: Record<string, string> = {
  // 摄影 - 人像
  style: '风格',
  tone: '色调',
  environment: '环境',
  makeup: '妆容',
  pose: '姿势',
  lighting: '光线',
  // 摄影 - 风景
  timeOfDay: '时间',
  weather: '天气',
  season: '季节',
  composition: '构图',
  // 摄影 - 电影画面
  filmStyle: '电影风格',
  mood: '氛围',
  cameraAngle: '机位',
  // 摄影 - 商业
  productType: '产品类型',
  background: '背景',
  props: '道具',
  // 摄影 - 纪事
  eventType: '事件类型',
  documentaryStyle: '纪实风格',
  // 设计
  modelStyle: '3D 风格',
  material: '材质',
  perspective: '透视',
  layout: '布局',
  colorScheme: '配色',
  typography: '字体',
  artStyle: '艺术风格',
  theme: '主题',
  iconStyle: '图标风格',
  size: '尺寸',
  // 绘画
  illustrationStyle: '插图风格',
  colorPalette: '色彩',
  comicStyle: '漫画风格',
  panelLayout: '分镜布局',
  conceptArtStyle: '原画风格',
  detailLevel: '细节程度',
  cartoonStyle: '卡通风格',
  characterDesign: '角色设计',
};

function getDefaultGrid9Purpose(graphType: string, subType: string): Grid9Purpose {
  if (graphType === 'design') return 'options';
  if (graphType === 'painting') {
    if (subType === 'comic') return 'storyboard';
    return 'options';
  }
  if (graphType === 'photograph') {
    if (subType === 'cinematic' || subType === 'documentary') return 'storyboard';
    if (subType === 'commercial') return 'variants';
    if (subType === 'portrait') return 'character';
    return 'variants';
  }
  return 'options';
}

function getGraphType(t: WritingTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  return (rp?.graphType as string) ?? '';
}

function getTaskTitle(t: WritingTaskItem): string {
  const labelVal = (t.metadata?.label as string)?.trim();
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string) || '';
  return (
    labelVal ||
    (promptVal?.trim().length
      ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
      : '图片任务')
  );
}

export default function Graph() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [graphType, setGraphType] = useState<'photograph' | 'design' | 'painting'>('photograph');
  const [type, setType] = useState('portrait');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [grid9, setGrid9] = useState(false);
  const [grid9Purpose, setGrid9Purpose] = useState<Grid9Purpose>(getDefaultGrid9Purpose('photograph', 'portrait'));
  const [grid9Split, setGrid9Split] = useState(true);
  const [grid9PurposeTouched, setGrid9PurposeTouched] = useState(false);
  const [label, setLabel] = useState('');
  const [formOptions, setFormOptions] = useState<Record<string, unknown> | null>(null);
  const [loadingFormOptions, setLoadingFormOptions] = useState(false);
  const [advancedParams, setAdvancedParams] = useState<Record<string, string>>({});

  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [referenceImageType, setReferenceImageType] = useState<ReferenceImageType>('main-subject');
  const [uploadingRef, setUploadingRef] = useState(false);
  const uploadRefInputRef = useRef<HTMLInputElement | null>(null);

  // 卸载时释放引用图 blob URL，避免内存泄漏
  useEffect(() => {
    return () => {
      referenceImages.forEach((r) => {
        if (r.previewUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(r.previewUrl);
          } catch {
            // ignore
          }
        }
      });
    };
    // 只在卸载时执行清理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = useState(false);
  const [filterGraphType, setFilterGraphType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const thumbnailFetchingRef = useRef<Set<string>>(new Set());
  const hasInitialLoadedRef = useRef(false);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;

    // 仅第一次进入页面时展示整体 loading，后续轮询静默更新，避免列表频繁“闪一下”
    if (!hasInitialLoadedRef.current) {
      setLoadingTasks(true);
    }

    try {
      // 不传 startDate 时后端返回全部任务
      const res = await listCgiTasks({
        type: 'graph',
        limit: 200,
        offset: 0,
      });
      const body = res.data as WritingTaskListResponse | undefined;
      const incoming = body?.data?.tasks ?? [];

      setTasks((prev) => {
        // 按 id 建索引，尽量复用旧对象，减少 React diff & 重渲染
        const prevMap = new Map(prev.map((t) => [t.id, t]));
        let changed = false;

        const merged = incoming.map((next) => {
          const old = prevMap.get(next.id);
          if (!old) {
            changed = true;
            return next;
          }

          // 只关心会影响 UI 的字段：status / progress / createdAt 等
          const sameStatus = old.status === next.status;
          const sameCreated = old.createdAt === next.createdAt;
          const sameProgress =
            (!!old.progress?.progress || old.progress?.progress === 0) ===
              (!!next.progress?.progress || next.progress?.progress === 0) &&
            old.progress?.progress === next.progress?.progress &&
            old.progress?.error === next.progress?.error;

          if (sameStatus && sameCreated && sameProgress) {
            // 其他字段变化较少，复用旧引用，避免整个列表节点重建
            return old;
          }

          changed = true;
          return next;
        });

        // 长度变化（新增/删除任务）也视为有变化
        if (!changed && merged.length === prev.length) {
          return prev;
        }

        return merged;
      });
    } catch (e) {
      console.error('加载图片任务失败:', e);
      // 仅在首次加载失败时清空列表；后续轮询异常不打断当前展示
      if (!hasInitialLoadedRef.current) {
        setTasks([]);
      }
    } finally {
      hasInitialLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 8000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // 加载表单选项（高级参数的可选值）
  useEffect(() => {
    let cancelled = false;
    setLoadingFormOptions(true);
    getGraphFormOptions({ graphType, type, lang: 'zh' })
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as { data?: { options?: Record<string, unknown> }; options?: Record<string, unknown> } | undefined;
        const options = body?.data?.options ?? body?.options ?? null;
        setFormOptions(options);
        // 类型切换时清空高级参数（避免串类型）
        setAdvancedParams({});
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[Graph] 获取表单选项失败:', e);
        setFormOptions(null);
        setAdvancedParams({});
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingFormOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graphType, type]);

  // 未手动选择时，自动应用默认多图用途
  useEffect(() => {
    if (!grid9PurposeTouched) {
      setGrid9Purpose(getDefaultGrid9Purpose(graphType, type));
    }
  }, [graphType, type, grid9PurposeTouched]);

  const filteredTasks = tasks
    .filter((t) => {
      if (filterGraphType && getGraphType(t) !== filterGraphType) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  // 已完成任务的缩略图：按需拉取并缓存 blob URL
  useEffect(() => {
    filteredTasks.forEach((t) => {
      if (t.status !== 'completed' || thumbnailCache[t.id] || thumbnailFetchingRef.current.has(t.id)) return;
      thumbnailFetchingRef.current.add(t.id);
      fetchMediaBlobUrl(t.id, 'graph')
        .then((url) => setThumbnailCache((prev) => ({ ...prev, [t.id]: url })))
        .finally(() => thumbnailFetchingRef.current.delete(t.id));
    });
  }, [filteredTasks, thumbnailCache]);

  // 任务从列表移除时释放对应 blob，避免内存泄漏
  useEffect(() => {
    const ids = new Set(filteredTasks.map((t) => t.id));
    setThumbnailCache((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (!ids.has(id)) {
          try {
            URL.revokeObjectURL(prev[id]);
          } catch {
            // ignore
          }
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filteredTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!prompt.trim()) {
      notification.warning({ message: '请输入提示词', placement: 'top' });
      return;
    }

    setLoading(true);
    try {
      const cleanedAdvanced: Record<string, unknown> = {};
      Object.entries(advancedParams).forEach(([k, v]) => {
        const vv = String(v ?? '').trim();
        if (vv) cleanedAdvanced[k] = vv;
      });

      const body: Record<string, unknown> = {
        type,
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
        grid9,
        ...(grid9
          ? {
              grid9Purpose,
              grid9Split,
            }
          : {}),
        referenceImage:
          referenceImages.length > 0
            ? referenceImages.map((r) => ({ content: r.content, type: r.type }))
            : undefined,
        ...cleanedAdvanced,
        storeToMinio: true,
        metadata: label.trim() ? { label: label.trim() } : undefined,
      };

      const result = await postGraph(graphType, body);
      const bodyRes = (result.data as Record<string, unknown>) ?? {};
      if (result.error || bodyRes.error) {
        notification.error({
          message: '提交失败',
          description: (bodyRes.error as string) || result.error || '请稍后重试',
          placement: 'top',
        });
        return;
      }
      const innerData = bodyRes.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? bodyRes.taskId) as string | undefined;
      if (taskId) {
        notification.success({
          message: '任务已创建',
          description: `${taskId}\n可在左侧任务列表中查看进度。`,
          placement: 'top',
        });
        setPrompt('');
        setLabel('');
        loadTasks();
      } else {
        notification.info({
          message: '响应异常',
          description: '未获取到 taskId，请查看控制台',
          placement: 'top',
        });
      }
    } catch (err) {
      notification.error({
        message: '提交失败',
        description: err instanceof Error ? err.message : String(err),
        placement: 'top',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, t: WritingTaskItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除任务「${getTaskTitle(t)}」吗？此操作不可恢复。`)) return;
    setDeletingId(t.id);
    try {
      const res = await deleteTask(t.id);
      if (res.error) {
        alert(res.error);
      } else {
        loadTasks();
        if (viewerTask?.id === t.id) setViewerVisible(false);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleTaskClick = async (t: WritingTaskItem) => {
    setViewerVisible(true);
    setViewerTask(t);
    setViewerUrls([]);
    setViewerError(null);
    setViewerLoading(true);
    try {
      // 已完成任务统一通过带认证的媒体接口取 blob，保证弹窗内图片能正常显示（getTask 的 mediaUrls 可能是内网 MinIO 地址）
      if (t.status === 'completed') {
        const blobUrl = await fetchMediaBlobUrl(t.id, 'graph');
        setViewerUrls([blobUrl]);
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  const typeOptions = TYPE_MAP[graphType] ?? PHOTOGRAPH_TYPES;

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="form-group graph-form">
          <div className="form-row">
            <label>业务类型</label>
            <select
              value={graphType}
              onChange={(e) => {
                const v = e.target.value as 'photograph' | 'design' | 'painting';
                setGraphType(v);
                setType((TYPE_MAP[v] ?? PHOTOGRAPH_TYPES)[0]?.value ?? 'portrait');
              }}
            >
              {GRAPH_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>细分类型</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>提示词 *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要生成的画面..."
              rows={4}
              required
            />
          </div>

          <div className="form-row form-row--switch">
            <label>多图模式</label>
            <div className="graph-form-grid9-wrap">
              <Switch
                checked={grid9}
                onChange={(v) => {
                  setGrid9(v);
                  if (v && !grid9PurposeTouched) {
                    setGrid9Purpose(getDefaultGrid9Purpose(graphType, type));
                  }
                }}
                checkedChildren="九宫格"
                unCheckedChildren="单图"
              />
              <span className="graph-form-grid9-hint">
                {grid9 ? '一次生成 9 张图（3×3 布局）' : '单张图片'}
              </span>
            </div>
          </div>

          {grid9 && (
            <div className="form-row">
              <label>多图意图</label>
              <div className="graph-form-grid9-wrap">
                <select
                  value={grid9Purpose}
                  onChange={(e) => {
                    setGrid9Purpose(e.target.value as Grid9Purpose);
                    setGrid9PurposeTouched(true);
                  }}
                  className="graph-filter-select"
                >
                  {GRID9_PURPOSE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="graph-form-grid9-hint">
                  {GRID9_PURPOSE_OPTIONS.find((o) => o.value === grid9Purpose)?.hint ?? ''}
                </span>
              </div>
            </div>
          )}

          {grid9 && (
            <div className="form-row form-row--switch">
              <label>是否切图</label>
              <div className="graph-form-grid9-wrap">
                <Switch
                  checked={grid9Split}
                  onChange={setGrid9Split}
                  checkedChildren="切成9张"
                  unCheckedChildren="不切图"
                />
                <span className="graph-form-grid9-hint">
                  {grid9Split ? '生成后切割为 9 张并创建 9 个任务' : '仅返回 1 张九宫格大图（不走父/子任务）'}
                </span>
              </div>
            </div>
          )}

          <details className="graph-advanced">
            <summary>高级参数</summary>
            {loadingFormOptions && <p className="muted">加载参数中...</p>}
            {!loadingFormOptions && !formOptions && <p className="muted">暂无高级参数</p>}
            {!loadingFormOptions && formOptions && (
              <div className="graph-advanced-grid">
                {Object.entries(formOptions).map(([k, v]) => {
                  const opts = normalizeFormOptions(v);
                  if (opts.length === 0) return null;
                  return (
                    <div key={k} className="form-row">
                      <label>{ADVANCED_PARAM_LABELS[k] ?? k}</label>
                      <select
                        value={advancedParams[k] ?? ''}
                        onChange={(e) => setAdvancedParams((p) => ({ ...p, [k]: e.target.value }))}
                      >
                        <option value="">（不选）</option>
                        {opts.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </details>

          <div className="form-row">
            <label>参考图片（最多10张）</label>
            {referenceImages.length > 0 && (
              <div className="graph-ref-grid">
                {referenceImages.map((ref, idx) => (
                  <div key={`${ref.content}-${idx}`} className="graph-ref-item">
                    <img src={ref.previewUrl} className="graph-ref-img" alt="" />
                    <button
                      type="button"
                      className="graph-ref-remove"
                      onClick={() => {
                        if (ref.previewUrl.startsWith('blob:')) {
                          try {
                            URL.revokeObjectURL(ref.previewUrl);
                          } catch {
                            // ignore
                          }
                        }
                        setReferenceImages((p) => p.filter((_, i) => i !== idx));
                      }}
                    >
                      ×
                    </button>
                    <span className="graph-ref-badge">
                      {REFERENCE_IMAGE_TYPES.find((t) => t.value === ref.type)?.label ?? ref.type}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="graph-ref-controls">
              <input
                ref={uploadRefInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (referenceImages.length >= 10) return;
                  setUploadingRef(true);
                  try {
                    const res = await uploadAssets(file);
                    const err = (res as { error?: string }).error;
                    const d = (res.data as { data?: { url?: string; proxyPath?: string; bucket?: string; key?: string } } | undefined)?.data;
                    if (err || !d?.url) {
                      notification.error({ message: '上传失败', description: err || '上传失败', placement: 'top' });
                      return;
                    }
                    const previewUrl = (d.bucket && d.key) ? await fetchAssetBlobUrl(d.bucket, d.key) : (d.proxyPath || d.url);
                    const contentUrl = (() => {
                      const raw = d.url;
                      if (!raw) return previewUrl;
                      if (/^https?:\/\//i.test(raw)) return raw;
                      if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
                      return raw;
                    })();
                    setReferenceImages((p) =>
                      [...p, { content: contentUrl, previewUrl, type: referenceImageType }].slice(0, 10)
                    );
                  } catch (ex) {
                    notification.error({
                      message: '上传失败',
                      description: ex instanceof Error ? ex.message : String(ex),
                      placement: 'top',
                    });
                  } finally {
                    setUploadingRef(false);
                    e.target.value = '';
                  }
                }}
              />
              <select
                value={referenceImageType}
                onChange={(e) => setReferenceImageType(e.target.value as ReferenceImageType)}
              >
                {REFERENCE_IMAGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="graph-ref-upload"
                onClick={() => uploadRefInputRef.current?.click()}
                disabled={uploadingRef || referenceImages.length >= 10}
              >
                {uploadingRef ? '上传中...' : referenceImages.length >= 10 ? '已达上限' : '上传图片'}
              </button>
            </div>
          </div>

          <div className="form-row-group">
            <div className="form-row">
              <label>宽高比</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
              >
                {ASPECT_RATIOS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>任务名称</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="可选，用于列表展示"
              />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '提交中...' : '生成图片'}
          </button>
        </form>
  );

  return (
    <section className="page-card graph-page">
      <div className="graph-header">
        <div className="graph-header-main">
          <div className="graph-filters">
            <select
              value={filterGraphType}
              onChange={(e) => setFilterGraphType(e.target.value)}
              className="graph-filter-select"
            >
              <option value="">全部类型</option>
              {GRAPH_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="graph-filter-select"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="graph-header-actions">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => loadTasks()}
            disabled={loadingTasks}
          >
            {loadingTasks ? '刷新中…' : '刷新列表'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen(true)}
            disabled={!isLoggedIn}
          >
            新建图片任务
          </button>
        </div>
      </div>

      <div className="graph-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看任务列表。</p>
        ) : loadingTasks ? (
          <p className="muted">加载中...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="muted">暂无图片任务，点击右上角「新建图片任务」开始。</p>
        ) : (
          <ul className="graph-task-list">
            {filteredTasks.map((t) => (
              <li
                key={t.id}
                className="graph-task-item graph-task-item-clickable"
                role="button"
                tabIndex={0}
                onClick={() => handleTaskClick(t)}
                onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(t)}
              >
                <div className="graph-task-thumb">
                  {t.status === 'completed' ? (
                    thumbnailCache[t.id] ? (
                      <img src={thumbnailCache[t.id]} alt="" className="graph-task-thumb-img" />
                    ) : (
                      <span className="graph-task-thumb-placeholder">加载中</span>
                    )
                  ) : (
                    <span className="graph-task-thumb-placeholder">—</span>
                  )}
                </div>
                <div className="graph-task-content">
                  <span className="graph-task-title" title={getTaskTitle(t)}>
                    {getTaskTitle(t)}
                  </span>
                  <div className="graph-task-meta">
                    {getGraphType(t) && (
                      <span className="graph-task-subtype">
                        {GRAPH_TYPE_OPTIONS.find((o) => o.value === getGraphType(t))?.label ??
                          getGraphType(t)}
                      </span>
                    )}
                    <code className="graph-task-id" title={t.id}>
                      {t.id.length > 12 ? `${t.id.slice(0, 12)}…` : t.id}
                    </code>
                    {t.progress?.progress != null && (
                      <span className="graph-task-progress">{t.progress.progress}%</span>
                    )}
                    {t.progress?.error && (
                      <span className="graph-task-error" title={t.progress.error}>
                        {t.progress.error.slice(0, 40)}…
                      </span>
                    )}
                  </div>
                </div>
                <div className="graph-task-actions">
                  <span className={`graph-task-status graph-task-status--${t.status}`}>
                    {STATUS_MAP[t.status] ?? t.status}
                  </span>
                  <button
                    type="button"
                    className="btn-danger btn-small"
                    title="删除"
                    onClick={(e) => handleDeleteTask(e, t)}
                    disabled={deletingId === t.id}
                  >
                    {deletingId === t.id ? '…' : '删除'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <GraphViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '图片结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title="新建图片任务"
        placement="right"
        width={520}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnClose
      >
        {renderForm()}
      </Drawer>
    </section>
  );
}
