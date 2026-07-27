/**
 * 将单段 unifiedTemplate 拆成写作旧链路使用的「规则段」与「输出格式段」。
 * 约定与 composeLegacyPromptToUnified / seed 一致：可选前置正文 + `【用户需求】` + `【输出要求】`。
 */
export function splitUnifiedTemplateForLegacyParts(unified: string): {
  preamble: string;
  outputFormatTail: string;
} {
  const u = String(unified ?? '').trim();
  const mUser = u.indexOf('【用户需求】');
  const mOut = u.indexOf('【输出要求】');
  if (mUser < 0) {
    return { preamble: u, outputFormatTail: '' };
  }
  const preamble = u.slice(0, mUser).trim();
  if (mOut < 0 || mOut <= mUser) {
    return { preamble: preamble || u.slice(0, mUser).trim(), outputFormatTail: '' };
  }
  const tail = u.slice(mOut + '【输出要求】'.length).trim();
  return { preamble, outputFormatTail: tail };
}

/** 与 seed / composeLegacy 对齐的标准写作 unified 骨架 */
export function buildWritingUnifiedTemplateFromLegacyParts(rules: string, outputFormat: string): string {
  const parts: string[] = [];
  if (rules.trim()) parts.push(rules.trim());
  parts.push('【用户需求】\n${prompt}');
  if (outputFormat.trim()) parts.push(`【输出要求】\n${outputFormat.trim()}`);
  return parts.join('\n\n');
}
