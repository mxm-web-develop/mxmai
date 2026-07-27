import { useCallback, useState } from 'react';
import { App, Button, Card, Input, Space, Typography, Upload } from 'antd';
import { DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { uploadReferenceImageToR2 } from '../../api/client';

export type GarmentSkuRow = { label: string; images: Array<{ content: string; type: string; purpose?: string }> };

function emptyGarment(label = ''): GarmentSkuRow {
  return { label, images: [] };
}

function readImageDefaultType(itemsDef: Record<string, unknown> | undefined): string {
  const items = itemsDef?.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) return 'outfits';
  const props = (items as { properties?: Record<string, unknown> }).properties;
  const typeProp = props?.type;
  if (!typeProp || typeof typeProp !== 'object') return 'outfits';
  const d = (typeProp as { default?: unknown }).default;
  return typeof d === 'string' && d.trim() ? d : 'outfits';
}

function ImageUploadList({
  title,
  images,
  defaultType,
  maxItems,
  onChange,
}: {
  title: string;
  images: GarmentSkuRow['images'];
  defaultType: string;
  maxItems: number;
  onChange: (next: GarmentSkuRow['images']) => void;
}) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (fileList: File[]) => {
      if (images.length >= maxItems) {
        message.warning(`最多 ${maxItems} 张`);
        return;
      }
      setUploading(true);
      try {
        const next = [...images];
        for (const file of fileList.slice(0, maxItems - images.length)) {
          const res = await uploadReferenceImageToR2(file);
          next.push({ content: res.url, type: defaultType });
        }
        onChange(next);
      } catch (e) {
        message.error(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [defaultType, images, maxItems, message, onChange]
  );

  return (
    <div>
      <Typography.Text strong style={{ fontSize: 12 }}>
        {title}
      </Typography.Text>
      <Space orientation="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
        {images.map((img, idx) => (
          <Space key={`${img.content}-${idx}`} wrap>
            <Typography.Text code style={{ fontSize: 11, maxWidth: 280 }} ellipsis>
              {img.content}
            </Typography.Text>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onChange(images.filter((_, i) => i !== idx))}
            />
          </Space>
        ))}
        {images.length < maxItems && (
          <Upload
            multiple
            showUploadList={false}
            beforeUpload={(file, list) => {
              void handleUpload(list.length ? list : [file]);
              return false;
            }}
          >
            <Button size="small" icon={<UploadOutlined />} loading={uploading}>
              上传图片
            </Button>
          </Upload>
        )}
      </Space>
    </div>
  );
}

function normalizeRows(raw: unknown): GarmentSkuRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyGarment('SKU-1')];
  return raw.map((row, i) => {
    if (!row || typeof row !== 'object') return emptyGarment(`SKU-${i + 1}`);
    const r = row as { label?: unknown; images?: unknown };
    return {
      label: String(r.label ?? `SKU-${i + 1}`),
      images: Array.isArray(r.images)
        ? (r.images as GarmentSkuRow['images'])
        : [],
    };
  });
}

export function EshopGarmentBatchField({
  value,
  onChange,
  def,
}: {
  value: unknown;
  onChange: (next: GarmentSkuRow[]) => void;
  def: Record<string, unknown>;
}) {
  const rows = normalizeRows(value);
  const itemsDef = (def.items && typeof def.items === 'object' && !Array.isArray(def.items)
    ? def.items
    : {}) as Record<string, unknown>;
  const imageItemsDef = (itemsDef.properties as Record<string, unknown> | undefined)?.images as
    | Record<string, unknown>
    | undefined;
  const imageDefaultType = readImageDefaultType(imageItemsDef);
  const maxImagesPerSku = Math.max(1, Number(imageItemsDef?.maxItems ?? 3) || 3);

  const patchRows = (next: GarmentSkuRow[]) => onChange(next.length > 0 ? next : [emptyGarment('SKU-1')]);

  return (
    <Card
      size="small"
      title="服装 SKU 列表"
      extra={
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => patchRows([...rows, emptyGarment(`SKU-${rows.length + 1}`)])}
        >
          添加款式
        </Button>
      }
    >
      {rows.map((row, idx) => (
        <Card
          key={idx}
          size="small"
          type="inner"
          style={{ marginBottom: 8 }}
          title={`款式 ${idx + 1}`}
          extra={
            rows.length > 1 ? (
              <Button size="small" danger onClick={() => patchRows(rows.filter((_, i) => i !== idx))}>
                删除
              </Button>
            ) : null
          }
        >
          <Input
            size="small"
            placeholder="SKU 标签"
            value={row.label}
            onChange={(e) => {
              const next = rows.map((g, i) => (i === idx ? { ...g, label: e.target.value } : g));
              patchRows(next);
            }}
            style={{ marginBottom: 8 }}
          />
          <ImageUploadList
            title="服装图（1～3 张）"
            images={row.images}
            defaultType={imageDefaultType}
            maxItems={maxImagesPerSku}
            onChange={(images) => {
              const next = rows.map((g, i) => (i === idx ? { ...g, images } : g));
              patchRows(next);
            }}
          />
        </Card>
      ))}
    </Card>
  );
}
