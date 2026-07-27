/**
 * gpt-image 系列：将 Graph 表单字段映射为 OpenAI 兼容图像 API 参数（parameters 内透传）。
 *
 * 注意：AtlasCloud 代理的 gpt-image-2 上游明确拒绝 background=transparent；
 * 此类路由仅保留 PNG 输出 + 提示词层面的「透明底」描述，不传 API background。
 */

export type GptImageFormApiOptions = {
  provider?: string;
};

/** 是否可向图像 API 发送 background=transparent */
export function supportsGptImageTransparentBackgroundApi(
  modelName: string,
  provider?: string,
): boolean {
  const model = String(modelName);
  if (!model.startsWith('gpt-image')) return false;

  const p = String(provider ?? '').toLowerCase();

  // 实测：AtlasCloud → openai/gpt-image-2 返回 invalid_value（Transparent background is not supported）
  if (p === 'atlascloud') return false;

  // gpt-image-2 系列在多数代理通道同样不支持；保守禁用，待单通道验证后再放开
  if (model === 'gpt-image-2' || model === 'gpt-image-2-all' || model.startsWith('gpt-image-2-')) {
    return false;
  }

  return true;
}

export function applyGptImageFormApiOptions(
  imageParams: Record<string, unknown>,
  sourceParams: Record<string, unknown>,
  modelName: string,
  options?: GptImageFormApiOptions,
): void {
  if (!String(modelName).startsWith('gpt-image')) return;

  const prev =
    typeof imageParams.parameters === 'object' &&
    imageParams.parameters &&
    !Array.isArray(imageParams.parameters)
      ? (imageParams.parameters as Record<string, unknown>)
      : {};

  const parameters: Record<string, unknown> = { ...prev };

  if (sourceParams.transparent_background === true) {
    if (supportsGptImageTransparentBackgroundApi(modelName, options?.provider)) {
      parameters.background = 'transparent';
    }
    parameters.output_format = 'png';
  }

  if (imageParams.aspect_ratio && parameters.aspect_ratio == null) {
    parameters.aspect_ratio = imageParams.aspect_ratio;
  }

  if (Object.keys(parameters).length > 0) {
    imageParams.parameters = parameters;
  }
}
