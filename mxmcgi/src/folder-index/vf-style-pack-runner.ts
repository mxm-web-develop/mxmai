import type { AppLocale } from '@mxmai/mxmdata';
/**
 * 风格卡：通过入库 text 业务抽取单帧 / 汇总整包（禁止直连 DeerAPI）
 * UI 称「视觉风格」；语感文风见 vf-writing-style-pack-runner
 */
import { runTaskV2 } from '../tasks/task-engine';
import { parseLlmStructuredOutput } from '../tasks/parse-llm-json';
import {
  normalizeStylePackSummary,
  normalizeStyleVisionObj,
  type StylePackSummary,
  type StyleVisionObj,
} from './style-vision-types';

export const VF_STYLE_FRAME_TASK_KEY = 'text/transform/vf-style-frame';
export const VF_STYLE_PACK_TASK_KEY = 'text/transform/vf-style-pack';

function bufferToDataUri(buffer: Buffer, mimeType: string): string {
  const mime = (mimeType || 'image/jpeg').split(';')[0] || 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function runTextTransform(
  userId: string,
  subtype: 'vf-style-frame' | 'vf-style-pack',
  params: Record<string, unknown>
): Promise<string> {
  const result = await runTaskV2(
    {
      scope: 'text',
      taskKey: 'transform',
      subtype,
      params: {
        ...params,
        metadata: {
          ...((params.metadata as Record<string, unknown> | undefined) ?? {}),
          virtualFolderStylePack: true,
          subtype,
        },
      },
    },
    userId
  );
  if (!result.success || !result.syncResult) {
    throw new Error(
      `风格解析 text/${subtype} 失败（taskId=${result.taskId}，status=${result.status}）`
    );
  }
  const text = result.syncResult.text ?? '';
  if (!text.trim()) {
    throw new Error(`风格解析 text/${subtype} 返回空文本`);
  }
  return text;
}

/** 单张图 → StyleVisionObj */
export async function runVfStyleFrameFromImage(
  userId: string,
  input: { buffer: Buffer; mimeType: string; title?: string; userLang?: AppLocale }
): Promise<StyleVisionObj> {
  const dataUriRaw = bufferToDataUri(input.buffer, input.mimeType);
  let dataUri = dataUriRaw;
  try {
    const { compressImage } = await import('../core/graph/reference-image');
    const { compressed } = await compressImage(dataUriRaw, 1.2, 1280, 1280, 78);
    dataUri = compressed;
  } catch {
    /* keep raw */
  }
  const text = await runTextTransform(userId, 'vf-style-frame', {
    design_text: '',
    source_mode: 'image',
    asset_title: input.title || '',
    user_language: input.userLang ?? 'zh',
    prompt: input.title || 'style reference image',
    referenceImage: [
      {
        content: dataUri,
        type: 'style-reference',
        purpose: 'vf-style-frame',
      },
    ],
    // Atlas chat 不接受 parameters.image 顶层字段；走 referenceImage multimodal
    parameters: {},
  });
  const parsed = parseLlmStructuredOutput(text, VF_STYLE_FRAME_TASK_KEY);
  return normalizeStyleVisionObj(parsed, { source: 'image', title: input.title });
}

/** 设计文案 → StyleVisionObj */
export async function runVfStyleFrameFromText(
  userId: string,
  input: { designText: string; title?: string; userLang?: AppLocale }
): Promise<StyleVisionObj> {
  const designText = input.designText.trim();
  if (!designText) {
    throw new Error('设计文案为空，无法抽取风格');
  }
  const text = await runTextTransform(userId, 'vf-style-frame', {
    design_text: designText.slice(0, 120000),
    source_mode: 'text',
    asset_title: input.title || '',
    user_language: input.userLang ?? 'zh',
    prompt: designText.slice(0, 2000),
  });
  const parsed = parseLlmStructuredOutput(text, VF_STYLE_FRAME_TASK_KEY);
  return normalizeStyleVisionObj(parsed, { source: 'text', title: input.title });
}

/** 多帧汇总 → StylePackSummary */
export async function runVfStylePack(
  userId: string,
  input: {
    folderName: string;
    frames: StyleVisionObj[];
    userLang?: AppLocale;
  }
): Promise<StylePackSummary> {
  const slim = input.frames.map((f) => {
    const {
      media_url: _m,
      title: _t,
      ref_type,
      ref_id,
      ...rest
    } = f;
    return {
      ...rest,
      ...(ref_type && ref_id ? { ref_key: `${ref_type}:${ref_id}` } : {}),
      ...(f.title ? { title: f.title } : {}),
    };
  });
  const frames_json = JSON.stringify(slim);
  const text = await runTextTransform(userId, 'vf-style-pack', {
    folder_name: input.folderName,
    frame_count: input.frames.length,
    user_language: input.userLang ?? 'zh',
    frames_json,
    prompt: `folder=${input.folderName}; frames=${input.frames.length}`,
  });
  const parsed = parseLlmStructuredOutput(text, VF_STYLE_PACK_TASK_KEY);
  const exemplarGuess = input.frames
    .filter((f) => f.ref_type && f.ref_id)
    .sort((a, b) => (b.fit_score ?? b.confidence) - (a.fit_score ?? a.confidence))
    .slice(0, 5)
    .map((f) => `${f.ref_type}:${f.ref_id}`);
  return normalizeStylePackSummary(parsed, {
    frameCount: input.frames.length,
    folderName: input.folderName,
    exemplarRefIds: exemplarGuess,
    frames: input.frames,
  });
}
