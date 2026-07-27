/**
 * 虚拟文件夹图片分析（非风格卡）
 * 风格卡请走 vf-style-pack-runner + text/transform/vf-style-* 业务。
 * 本文件不再直连 DeerAPI / 写死视觉模型。
 */
import type { FolderCardTag } from '@mxmai/mxmdata';

/** @deprecated 风格卡已改用 StyleVisionObj；角色/知识暂用此结构直至独立 text 业务上线 */
export type ImageAnalysis = {
  caption: string;
  style_summary: string;
  palette: string[];
  composition?: string;
  subjects?: string[];
  ocr_text?: string;
  use_as: 'style_ref' | 'identity' | 'product' | 'mood' | 'palette' | 'doc' | 'unknown';
  negative_hints?: string[];
  voice_id?: string;
  media_url?: string;
  title?: string;
};

export function assetRoleFromUseAs(useAs: ImageAnalysis['use_as']): string {
  switch (useAs) {
    case 'identity':
      return 'appearance';
    case 'palette':
      return 'palette';
    case 'style_ref':
    case 'mood':
    case 'product':
      return 'style_ref';
    case 'doc':
      return 'doc';
    default:
      return 'unknown';
  }
}

/**
 * 角色/知识卡：暂不调用 LLM（待独立 text 业务）。
 * 返回可索引的占位分析，避免阻断文件夹解析。
 */
export function stubImageAnalysisForTag(
  name: string,
  cardTag?: FolderCardTag | null
): ImageAnalysis {
  if (cardTag === 'character') {
    return {
      caption: name,
      style_summary: '',
      palette: [],
      use_as: 'identity',
      subjects: [name],
    };
  }
  return {
    caption: name,
    style_summary: '',
    palette: [],
    use_as: 'doc',
  };
}

/** @deprecated 请改用风格包 text 业务；保留签名以免旧调用方编译失败 */
export async function analyzeImageBuffer(
  _buffer: Buffer,
  _mimeType: string,
  cardTag?: FolderCardTag | null
): Promise<ImageAnalysis> {
  return stubImageAnalysisForTag('image', cardTag);
}

export async function captionImageBuffer(
  _buffer: Buffer,
  _mimeType: string
): Promise<string> {
  return '';
}

export async function captionImages(
  images: Array<{ buffer: Buffer; mimeType: string; name: string }>,
  cardTag?: FolderCardTag | null
): Promise<Array<{ name: string; analysis: ImageAnalysis; text: string }>> {
  return images.map((img) => {
    const analysis = stubImageAnalysisForTag(img.name, cardTag);
    return {
      name: img.name,
      analysis,
      text: `[${img.name}]\n${analysis.caption}`,
    };
  });
}
