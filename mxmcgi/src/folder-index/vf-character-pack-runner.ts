import type { AppLocale } from '@mxmai/mxmdata';
/**
 * 角色卡：整夹一次 text/transform/vf-character-pack（禁止直连 DeerAPI）
 */
import { runTaskV2 } from '../tasks/task-engine';
import { parseLlmStructuredOutput } from '../tasks/parse-llm-json';
import { compressImage } from '../core/graph/reference-image';
import {
  CHARACTER_VISION_IMAGES_MAX,
  normalizeCharacterPackSummary,
  type CharacterPackSummary,
} from './character-vision-types';

export const VF_CHARACTER_PACK_TASK_KEY = 'text/transform/vf-character-pack';

function bufferToDataUri(buffer: Buffer, mimeType: string): string {
  const mime = (mimeType || 'image/jpeg').split(';')[0] || 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** 压缩后供 vision chat；限制边长/体积，避免 Atlas chat/completions 400 */
async function toVisionDataUri(buffer: Buffer, mimeType: string): Promise<string> {
  const raw = bufferToDataUri(buffer, mimeType);
  try {
    const { compressed } = await compressImage(raw, 1.2, 1280, 1280, 78);
    return compressed;
  } catch {
    return raw;
  }
}

export type CharacterPackImageInput = {
  ref_key: string;
  buffer: Buffer;
  mimeType: string;
  title?: string;
};

export async function runVfCharacterPack(
  userId: string,
  input: {
    folderName: string;
    dossierText: string;
    images: CharacterPackImageInput[];
    assetManifest: Array<{ ref_key: string; kind: 'image' | 'text'; title?: string }>;
    previous?: CharacterPackSummary | null;
    urlByRefKey?: Map<string, string>;
    userLang?: AppLocale;
  }
): Promise<CharacterPackSummary> {
  const images = input.images.slice(0, CHARACTER_VISION_IMAGES_MAX);
  const referenceImage = await Promise.all(
    images.map(async (img) => ({
      content: await toVisionDataUri(img.buffer, img.mimeType),
      type: 'character-reference',
      purpose: 'vf-character-pack',
      ref_key: img.ref_key,
    }))
  );

  const media_manifest_json = JSON.stringify(
    input.assetManifest.map((a) => ({
      ref_key: a.ref_key,
      kind: a.kind,
      ...(a.title ? { title: a.title } : {}),
    }))
  );

  const result = await runTaskV2(
    {
      scope: 'text',
      taskKey: 'transform',
      subtype: 'vf-character-pack',
      params: {
        folder_name: input.folderName,
        asset_count: input.assetManifest.length,
        dossier_text: input.dossierText.slice(0, 120000),
        media_manifest_json,
        user_language: input.userLang ?? 'zh',
        prompt: `folder=${input.folderName}; assets=${input.assetManifest.length}; images=${images.length}`,
        referenceImage,
        // 不再往 parameters.image 塞 data URI：Atlas chat 会当非法字段 400；
        // 多图走 referenceImage → provider 转成 multimodal messages。
        parameters: {},
        metadata: {
          virtualFolderCharacterPack: true,
          subtype: 'vf-character-pack',
        },
      },
    },
    userId
  );

  if (!result.success || !result.syncResult) {
    throw new Error(
      `角色解析 text/vf-character-pack 失败（taskId=${result.taskId}，status=${result.status}）`
    );
  }
  const text = result.syncResult.text ?? '';
  if (!text.trim()) {
    throw new Error('角色解析 text/vf-character-pack 返回空文本');
  }

  const parsed = parseLlmStructuredOutput(text, VF_CHARACTER_PACK_TASK_KEY);
  return normalizeCharacterPackSummary(parsed, {
    folderName: input.folderName,
    assetCount: input.assetManifest.length,
    urlByRefKey: input.urlByRefKey,
    previous: input.previous ?? null,
  });
}
