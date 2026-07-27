import { ExecutionContext } from '../models/types';
import { resolveSmartflowParams } from './resolve-smartflow-params';

type RefRow = { content?: string; type?: string };

function normalizeReferenceRows(raw: unknown): RefRow[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        if (typeof row === 'string') return { content: row, type: 'main-subject' };
        if (row && typeof row === 'object') return row as RefRow;
        return null;
      })
      .filter((r): r is RefRow => !!r && typeof r.content === 'string' && r.content.trim().length > 0);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [{ content: raw.trim(), type: 'main-subject' }];
  }
  return [];
}

/**
 * 从 model_params 解析 referenceImage，供 writingCompletion 视觉调用
 */
export function buildModelVisionParams(
  params: Record<string, unknown>,
  context: ExecutionContext
): { referenceImage?: RefRow[] } {
  const resolved = resolveSmartflowParams(params, context) as Record<string, unknown>;
  const raw =
    resolved.referenceImage ??
    resolved.reference_images ??
    resolved.reference_image ??
    resolved.image_base64s;

  const referenceImage = normalizeReferenceRows(raw);
  if (referenceImage.length === 0) return {};
  return { referenceImage };
}
