/** 与 mxmcgi voiceover-subtitle-normalize.stripSubtitlePunctuation 保持一致 */
export function stripSubtitlePunctuation(text: string): string {
  return text
    .replace(
      /[，。！？；：、,.!?;:'"()[\]{}「」『』（）【】《》…—–·～~、]/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}
