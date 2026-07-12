/**
 * 清理 TTS 文本里的「段落小标题」标记词（例如 `[开场]`、`[主稿]`、`[结束]`、
 * `[片头]`、`[广告]`、`[互动]` 等）。这些标记词如果出现在 t2a_v2 合成文本里，
 * MiniMax speech 模型会当成普通 token 朗读出来（如念出「左方括号开场右方括号」）。
 *
 * 识别规则：
 * - 仅匹配「整行只有 `[xxx]`」的情形（行首可有空白，行尾可有空白）。
 * - `xxx` 限 1～10 个汉字 / 英文字母 / 数字 / 空格（避免误伤正文里出现
 *   的 `[1] xxx` 这类带正文的引用）。
 * - 删除匹配行后，把相邻空行折叠成单个换行，避免连续空行导致音频里出现
 *   长段空白停顿。
 *
 * 这是防御性兜底，业务 prompt 也应明确要求模型不要保留这些标记词。
 */
const STAGE_MARKER_LINE_RE = /^[ \t]*\[[\u4e00-\u9fa5A-Za-z0-9 ]{1,10}\][ \t]*$/gm;

export function stripTtsStageMarkers(input: string): string {
  if (!input) return '';
  // 1) 删除整行的标记词
  const removed = input.replace(STAGE_MARKER_LINE_RE, '');
  // 2) 把 3 个及以上连续换行折叠为单个换行，避免留下"幽灵空行"
  return removed.replace(/\n{3,}/g, '\n\n');
}