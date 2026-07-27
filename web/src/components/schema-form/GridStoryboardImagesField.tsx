import { useCallback, useMemo, useState } from 'react';
import {
  App,
  Button,
  Input,
  Radio,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
} from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { analyzeGridLayout } from '../../api/client';

export type StoryboardGridLayout = '2x2' | '3x3' | '4x4';

export interface StoryboardGridCell {
  index: number;
  purpose?: string;
}

export interface StoryboardGridValue {
  enabled: boolean;
  layout: StoryboardGridLayout;
  auto_detect_layout: boolean;
  source_image: { content: string; type: string } | null;
  cells: StoryboardGridCell[];
  first_frame_index: number;
  last_frame_index: number | null;
}

const LAYOUT_OPTIONS: StoryboardGridLayout[] = ['2x2', '3x3', '4x4'];

function layoutToN(layout: StoryboardGridLayout): number {
  return layout === '2x2' ? 2 : layout === '3x3' ? 3 : 4;
}

function emptyCells(total: number): StoryboardGridCell[] {
  return Array.from({ length: total }, (_, index) => ({ index, purpose: '' }));
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const res = reader.result;
      if (typeof res !== 'string' || !res.startsWith('data:')) {
        reject(new Error('无法转换为 Base64'));
        return;
      }
      resolve(res);
    };
    reader.readAsDataURL(file);
  });
}

/** 提交时去掉 null 可选字段，避免 JSON Schema type: integer 校验失败 */
function emitStoryboardValue(
  onChange: (next: StoryboardGridValue) => void,
  value: StoryboardGridValue,
): void {
  const next: StoryboardGridValue = { ...value };
  if (next.last_frame_index === null) {
    delete (next as Partial<StoryboardGridValue>).last_frame_index;
  }
  if (next.source_image === null) {
    delete (next as Partial<StoryboardGridValue>).source_image;
  }
  onChange(next);
}

function normalizeValue(raw: unknown): StoryboardGridValue {
  const base: StoryboardGridValue = {
    enabled: false,
    layout: '3x3',
    auto_detect_layout: true,
    source_image: null,
    cells: emptyCells(9),
    first_frame_index: 0,
    last_frame_index: null,
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const v = raw as Partial<StoryboardGridValue>;
  const layout = (LAYOUT_OPTIONS.includes(v.layout as StoryboardGridLayout)
    ? v.layout
    : '3x3') as StoryboardGridLayout;
  const total = layoutToN(layout) ** 2;
  const cells =
    Array.isArray(v.cells) && v.cells.length === total
      ? v.cells.map((c, i) => ({
          index: typeof c.index === 'number' ? c.index : i,
          purpose: typeof c.purpose === 'string' ? c.purpose : '',
        }))
      : emptyCells(total);
  return {
    enabled: v.enabled === true,
    layout,
    auto_detect_layout: v.auto_detect_layout !== false,
    source_image:
      v.source_image && typeof v.source_image === 'object' && 'content' in v.source_image
        ? {
            content: String((v.source_image as { content?: unknown }).content ?? ''),
            type: String((v.source_image as { type?: unknown }).type ?? 'main-subject'),
          }
        : null,
    cells,
    first_frame_index: typeof v.first_frame_index === 'number' ? v.first_frame_index : 0,
    last_frame_index:
      v.last_frame_index === null
        ? null
        : typeof v.last_frame_index === 'number'
          ? v.last_frame_index
          : null,
  };
}

function gridCellBackgroundPosition(col: number, row: number, gridN: number): string {
  if (gridN <= 1) return '0% 0%';
  // background-size = N×100% 时，百分比定位步长为 100/(N-1)，末格对齐 100%
  const step = 100 / (gridN - 1);
  return `${col * step}% ${row * step}%`;
}

function GridCellPreview({
  sourceUrl,
  index,
  gridN,
  sourceAspect,
}: {
  sourceUrl: string;
  index: number;
  gridN: number;
  sourceAspect?: number;
}) {
  const row = Math.floor(index / gridN);
  const col = index % gridN;
  const cellAspect =
    sourceAspect && sourceAspect > 0 ? sourceAspect : 1;
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: `${cellAspect}`,
        borderRadius: 6,
        border: '1px solid var(--ant-color-border-secondary, #d9d9d9)',
        backgroundImage: `url(${sourceUrl})`,
        backgroundSize: `${gridN * 100}% ${gridN * 100}%`,
        backgroundPosition: gridCellBackgroundPosition(col, row, gridN),
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}

export function GridStoryboardImagesField({
  value,
  onChange,
  supportsLastFrame = true,
}: {
  value: unknown;
  onChange: (next: StoryboardGridValue) => void;
  supportsLastFrame?: boolean;
}) {
  const { message } = App.useApp();
  const state = useMemo(() => normalizeValue(value), [value]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectInfo, setDetectInfo] = useState<{
    layout: StoryboardGridLayout;
    confidence: string;
    orientation: string;
  } | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const gridN = layoutToN(state.layout);
  const totalCells = gridN * gridN;
  const cellAspect =
    sourceDimensions && sourceDimensions.width > 0 && sourceDimensions.height > 0
      ? sourceDimensions.width / sourceDimensions.height
      : 1;

  const patch = useCallback(
    (partial: Partial<StoryboardGridValue>) => {
      emitStoryboardValue(onChange, { ...state, ...partial });
    },
    [onChange, state],
  );

  const replaceState = useCallback(
    (next: StoryboardGridValue) => {
      emitStoryboardValue(onChange, next);
    },
    [onChange],
  );

  const handleLayoutChange = useCallback(
    async (layout: StoryboardGridLayout) => {
      const n = layoutToN(layout);
      const total = n * n;
      const next: StoryboardGridValue = {
        ...state,
        layout,
        cells: emptyCells(total),
        first_frame_index: 0,
        last_frame_index: null,
      };
      replaceState(next);

      const source = state.source_image?.content?.trim();
      if (!source) return;

      try {
        setAnalyzing(true);
        const analysis = await analyzeGridLayout({ base64: source, grid_n: n });
        setDetectInfo({
          layout,
          confidence: analysis.confidence,
          orientation: analysis.orientation,
        });
        setSourceDimensions({ width: analysis.width, height: analysis.height });
      } catch {
        /* 布局已更新，分析失败可忽略 */
      } finally {
        setAnalyzing(false);
      }
    },
    [replaceState, state],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setDetectInfo(null);
      setSourceDimensions(null);
      try {
        const dataUri = await readFileAsDataUri(file);
        const nextSource = { content: dataUri, type: 'main-subject' };

        if (state.auto_detect_layout) {
          setAnalyzing(true);
          try {
            const analysis = await analyzeGridLayout({ base64: dataUri });
            const detected = analysis.layout as StoryboardGridLayout | null;
            if (detected && ['2x2', '3x3', '4x4'].includes(detected)) {
              const n = layoutToN(detected);
              const total = n * n;
              replaceState({
                ...state,
                source_image: nextSource,
                layout: detected,
                cells: emptyCells(total),
                first_frame_index: 0,
                last_frame_index: null,
              });
              setDetectInfo({
                layout: detected,
                confidence: analysis.confidence,
                orientation: analysis.orientation,
              });
              setSourceDimensions({ width: analysis.width, height: analysis.height });
              if (analysis.confidence === 'low') {
                message.warning('宫格识别置信度较低，请确认布局是否正确');
              }
              return;
            }
            message.warning('未能自动识别宫格，请手动选择布局');
          } catch {
            message.warning('宫格分析失败，请手动选择布局');
          } finally {
            setAnalyzing(false);
          }
        }

        patch({ source_image: nextSource });
      } catch (e) {
        message.error(e instanceof Error ? e.message : '读取图片失败');
      } finally {
        setUploading(false);
      }
    },
    [message, patch, replaceState, state],
  );

  const frameOptions = useMemo(
    () =>
      Array.from({ length: totalCells }, (_, index) => {
        const row = Math.floor(index / gridN) + 1;
        const col = (index % gridN) + 1;
        return { value: index, label: `格 ${index + 1}（第 ${row} 行第 ${col} 列）` };
      }),
    [gridN, totalCells],
  );

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center">
        <Switch
          checked={state.enabled}
          onChange={(enabled) => patch({ enabled })}
        />
        <Typography.Text>启用宫格分镜图（单张源图裁切为多参考）</Typography.Text>
      </Space>

      {state.enabled && (
        <>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              布局（自动识别白缝裁切，顺序：左上 → 右下）
            </Typography.Text>
            <Space orientation="vertical" size="small" style={{ width: '100%' }}>
              <Space align="center">
                <Switch
                  size="small"
                  checked={state.auto_detect_layout}
                  onChange={(auto_detect_layout) => {
                    setDetectInfo(null);
                    patch({ auto_detect_layout });
                  }}
                />
                <Typography.Text type="secondary">上传后自动识别布局</Typography.Text>
              </Space>
              <Radio.Group
                optionType="button"
                value={state.layout}
                options={LAYOUT_OPTIONS.map((v) => ({ label: v, value: v }))}
                onChange={(e) => {
                  setDetectInfo(null);
                  void handleLayoutChange(e.target.value as StoryboardGridLayout);
                }}
              />
              {detectInfo && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  识别：{detectInfo.layout} · {detectInfo.orientation} · 置信度 {detectInfo.confidence}
                </Typography.Text>
              )}
            </Space>
          </div>

          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              源图（仅 1 张）
            </Typography.Text>
            {state.source_image?.content ? (
              <Space orientation="vertical" style={{ width: '100%' }}>
                <img
                  src={state.source_image.content}
                  alt="storyboard source"
                  style={{ maxWidth: 280, maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      setSourceDimensions({
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                      });
                    }
                  }}
                />
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setSourceDimensions(null);
                    setDetectInfo(null);
                    patch({ source_image: null });
                  }}
                >
                  移除源图
                </Button>
              </Space>
            ) : (
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUpload(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={uploading || analyzing}>
                  上传宫格 / 分镜源图
                </Button>
              </Upload>
            )}
          </div>

          {state.source_image?.content && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridN}, minmax(0, 1fr))`,
                  gap: 8,
                }}
              >
                {state.cells.map((cell) => (
                  <div key={cell.index}>
                    <GridCellPreview
                      sourceUrl={state.source_image!.content}
                      index={cell.index}
                      gridN={gridN}
                      sourceAspect={cellAspect}
                    />
                    <Input.TextArea
                      rows={2}
                      placeholder="本格分镜描述"
                      value={cell.purpose ?? ''}
                      onChange={(e) => {
                        const next = state.cells.map((c) =>
                          c.index === cell.index ? { ...c, purpose: e.target.value } : c,
                        );
                        patch({ cells: next });
                      }}
                      style={{ marginTop: 6, fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>

              <Space wrap size="large">
                <div>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    首帧格位
                  </Typography.Text>
                  <Select
                    style={{ minWidth: 200 }}
                    value={state.first_frame_index}
                    options={frameOptions}
                    onChange={(first_frame_index) => patch({ first_frame_index })}
                  />
                </div>
                {supportsLastFrame && (
                  <div>
                    <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                      尾帧格位（可选）
                    </Typography.Text>
                    <Select
                      allowClear
                      placeholder="不指定尾帧"
                      style={{ minWidth: 200 }}
                      value={state.last_frame_index ?? undefined}
                      options={frameOptions}
                      onChange={(v) =>
                        patch({ last_frame_index: v === undefined ? null : Number(v) })
                      }
                    />
                  </div>
                )}
              </Space>
            </>
          )}
        </>
      )}
    </Space>
  );
}
