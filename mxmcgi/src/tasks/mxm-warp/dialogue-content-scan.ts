/**
 * 多人语音 pre：扫描文稿 → 推荐口播形式 / 人数
 */
import { runTaskV2 } from '../task-engine';

export type DialogueContentScanInput = {
  sourceMaterial: string;
  language?: string;
  userId?: string;
};

export type DialogueFormatId =
  | 'alternate_read'
  | 'topic_discuss'
  | 'host_sidekick'
  | 'audio_drama';

export type DialogueContentScanResult = {
  suggested_format: DialogueFormatId;
  suggested_speakers: number;
  content_type: string;
  reason: string;
  alternatives: Array<{ format: DialogueFormatId; speakers: number; reason: string }>;
  /** 建议的默认语速风格 */
  suggested_broadcast_style: 'fast_talk' | 'news' | 'chat_show' | 'late_night';
};

const FORMAT_SET = new Set<string>([
  'alternate_read',
  'topic_discuss',
  'host_sidekick',
  'audio_drama',
]);

const FORMAT_TO_STYLE: Record<DialogueFormatId, DialogueContentScanResult['suggested_broadcast_style']> = {
  alternate_read: 'news',
  topic_discuss: 'chat_show',
  host_sidekick: 'chat_show',
  audio_drama: 'chat_show',
};

function clampSpeakers(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.min(6, Math.max(2, Math.round(v)));
}

function parseScanJson(text: string): Partial<DialogueContentScanResult> & Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let root: Record<string, unknown> | null = null;
  try {
    const direct = JSON.parse(trimmed) as Record<string, unknown>;
    if (direct && typeof direct === 'object') root = direct;
  } catch {
    /* try fence */
  }
  if (!root) {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      root = JSON.parse(m[0]!) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  // 新协议：{ content_scan, dialogue_format, ... }；旧协议：扁平 suggested_*
  const nested =
    root.content_scan && typeof root.content_scan === 'object' && !Array.isArray(root.content_scan)
      ? (root.content_scan as Record<string, unknown>)
      : null;
  return { ...(nested ?? {}), ...root };
}

function heuristicScan(source: string): DialogueContentScanResult {
  const hasDialogueMarks = /【[^】]+】|^[^\n]{1,12}[：:]/m.test(source);
  const len = source.trim().length;
  if (hasDialogueMarks) {
    return {
      suggested_format: 'audio_drama',
      suggested_speakers: 3,
      content_type: '对话稿',
      reason: '文稿已有对白痕迹，适合演绎有声剧。',
      alternatives: [
        { format: 'topic_discuss', speakers: 3, reason: '也可改成话题讨论' },
      ],
      suggested_broadcast_style: 'chat_show',
    };
  }
  if (len < 800) {
    return {
      suggested_format: 'host_sidekick',
      suggested_speakers: 2,
      content_type: '短文',
      reason: '篇幅较短，适合主讲加陪聊。',
      alternatives: [{ format: 'alternate_read', speakers: 2, reason: '也可两人交替朗读' }],
      suggested_broadcast_style: 'chat_show',
    };
  }
  return {
    suggested_format: 'topic_discuss',
    suggested_speakers: 3,
    content_type: '长文/议论文',
    reason: '内容偏论述，适合多人话题讨论。',
    alternatives: [
      { format: 'host_sidekick', speakers: 2, reason: '也可主讲陪聊' },
      { format: 'alternate_read', speakers: 2, reason: '也可资讯式交替朗读' },
    ],
    suggested_broadcast_style: 'chat_show',
  };
}

export async function previewDialogueContentScan(
  input: DialogueContentScanInput
): Promise<DialogueContentScanResult> {
  const source = String(input.sourceMaterial ?? '').trim();
  if (!source) {
    throw new Error('请先粘贴或上传文稿');
  }
  const excerpt = source.slice(0, 12000);
  const userId = input.userId?.trim();
  if (!userId) {
    return heuristicScan(excerpt);
  }

  try {
    const res = await runTaskV2(
      {
        scope: 'text',
        taskKey: 'expert',
        subtype: 'dialogue-content-scan',
        params: {
          contract: {
            basic: {
              source_material: excerpt,
              language: input.language || 'zh',
            },
            business: {},
          },
          field_specs: [
            { name: 'suggested_format' },
            { name: 'suggested_speakers' },
            { name: 'content_type' },
            { name: 'reason' },
            { name: 'alternatives' },
          ],
        },
      },
      userId
    );
    const text = res.syncResult?.text ?? '';
    const parsed = parseScanJson(text);
    if (!parsed) return heuristicScan(excerpt);

    const format = FORMAT_SET.has(String(parsed.suggested_format))
      ? (String(parsed.suggested_format) as DialogueFormatId)
      : FORMAT_SET.has(String(parsed.dialogue_format))
        ? (String(parsed.dialogue_format) as DialogueFormatId)
        : 'topic_discuss';
    const speakers = clampSpeakers(
      parsed.suggested_speakers ?? parsed.speaker_count
    );
    const altsRaw = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
    const alternatives = altsRaw
      .map((a) => {
        const row = a as { format?: string; speakers?: number; reason?: string };
        const f = String(row.format ?? '');
        if (!FORMAT_SET.has(f)) return null;
        return {
          format: f as DialogueFormatId,
          speakers: clampSpeakers(row.speakers),
          reason: String(row.reason ?? '').trim() || '备选',
        };
      })
      .filter(Boolean) as DialogueContentScanResult['alternatives'];

    const styleRaw = String(
      parsed.suggested_broadcast_style ?? parsed.broadcast_style ?? ''
    ).trim();
    const styleSet = new Set(['fast_talk', 'news', 'chat_show', 'late_night']);
    const suggested_broadcast_style = styleSet.has(styleRaw)
      ? (styleRaw as DialogueContentScanResult['suggested_broadcast_style'])
      : FORMAT_TO_STYLE[format];

    return {
      suggested_format: format,
      suggested_speakers: speakers,
      content_type: String(parsed.content_type ?? '').trim() || '文稿',
      reason: String(parsed.reason ?? '').trim() || '已根据文稿给出推荐。',
      alternatives,
      suggested_broadcast_style,
    };
  } catch (err) {
    console.warn('[previewDialogueContentScan] fallback heuristic:', err);
    return heuristicScan(excerpt);
  }
}
