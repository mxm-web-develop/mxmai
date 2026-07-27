import { normalizeUploadedMediaUrl } from '../api/client';

function isUsableReferenceContent(content: unknown): boolean {
  if (typeof content !== 'string' || !content.trim()) return false;
  const c = content.trim();
  if (c.startsWith('[Base64数据已过滤') || c === '[base64 filtered]' || c === '[filtered]') return false;
  if (c.startsWith('data:image/')) return true;
  if (/^https?:\/\//i.test(c)) return true;
  if (c.startsWith('/api/v1/media/') || c.startsWith('/media/')) return true;
  return false;
}

function schemaRefSlots(schema: unknown): Array<{ fieldKey: string; schemaType?: string; title: string }> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props) return [];
  const slots: Array<{ fieldKey: string; schemaType?: string; title: string }> = [];
  for (const [fieldKey, defRaw] of Object.entries(props)) {
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    if (def['x-ui-type'] !== 'referenceImages') continue;
    const title = typeof def.title === 'string' && def.title.trim() ? def.title.trim() : fieldKey;
    let schemaType: string | undefined;
    try {
      const items = def.items as { properties?: { type?: { default?: unknown } } } | undefined;
      const d = items?.properties?.type?.default;
      if (typeof d === 'string' && d.trim()) schemaType = d.trim();
    } catch {
      // ignore
    }
    slots.push({ fieldKey, schemaType, title });
  }
  return slots;
}

/** Web 提交前：合并 referenceImages 槽位，避免选图后 state 未 flush 导致 garment_images 缺失 */
export function prepareGraphReferenceSubmitParams(
  params: Record<string, unknown>,
  schema: unknown
): Record<string, unknown> {
  const slots = schemaRefSlots(schema);
  if (slots.length === 0) return params;

  const p = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(p, 'garment_images')) {
    const legacy = p.clothing_images;
    if (Array.isArray(legacy) && legacy.length > 0) {
      p.garment_images = legacy;
    }
  }

  const merged: Record<string, unknown>[] = [];
  for (const slot of slots) {
    const arr = Array.isArray(p[slot.fieldKey]) ? (p[slot.fieldKey] as unknown[]) : [];
    const enriched: Record<string, unknown>[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const content = row.content;
      if (!isUsableReferenceContent(content)) continue;
      const rawType = typeof row.type === 'string' && row.type.trim() ? String(row.type).trim() : '';
      enriched.push({
        ...row,
        content: normalizeUploadedMediaUrl(String(content).trim()),
        type: slot.schemaType || slot.fieldKey || rawType || 'main-subject',
        groupKey: slot.fieldKey,
        groupTitle: slot.title,
      });
    }
    if (enriched.length > 0) {
      p[slot.fieldKey] = enriched;
      merged.push(...enriched);
    }
  }

  const ref = p.referenceImage;
  const refEmpty =
    ref == null ||
    (Array.isArray(ref) && ref.length === 0) ||
    (typeof ref === 'string' && !String(ref).trim());

  if (merged.length > 0 && refEmpty) {
    p.referenceImage = merged;
  }

  const hasGarment = slots.some((s) => {
    if (s.fieldKey !== 'garment_images') return false;
    const arr = p.garment_images;
    return (
      Array.isArray(arr) &&
      arr.some((item) => item && typeof item === 'object' && isUsableReferenceContent((item as { content?: unknown }).content))
    );
  });

  if (!hasGarment && Array.isArray(ref) && ref.length > 0) {
    const buckets = new Map<string, Record<string, unknown>[]>();
    const slotKeys = new Set(slots.map((s) => s.fieldKey));
    const typeToSlot = new Map<string, string>();
    for (const s of slots) {
      if (s.schemaType) typeToSlot.set(s.schemaType, s.fieldKey);
      typeToSlot.set(s.fieldKey, s.fieldKey);
    }
    for (const item of ref) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (!isUsableReferenceContent(row.content)) continue;
      const gk = String(row.groupKey || '').trim();
      const t = String(row.type || '').trim();
      let target = gk && slotKeys.has(gk) ? gk : t && typeToSlot.has(t) ? typeToSlot.get(t)! : slots[0]?.fieldKey;
      if (!target) continue;
      if (!buckets.has(target)) buckets.set(target, []);
      buckets.get(target)!.push(row);
    }
    for (const slot of slots) {
      const items = buckets.get(slot.fieldKey);
      if (!items?.length) continue;
      const existing = Array.isArray(p[slot.fieldKey]) ? (p[slot.fieldKey] as unknown[]) : [];
      const hasUsable = existing.some(
        (item) => item && typeof item === 'object' && isUsableReferenceContent((item as { content?: unknown }).content)
      );
      if (hasUsable) continue;
      p[slot.fieldKey] = items.map((item) => ({
        ...item,
        content: normalizeUploadedMediaUrl(String(item.content).trim()),
        groupKey: item.groupKey || slot.fieldKey,
        type: slot.schemaType || slot.fieldKey || item.type || 'main-subject',
      }));
    }
  }

  return p;
}
