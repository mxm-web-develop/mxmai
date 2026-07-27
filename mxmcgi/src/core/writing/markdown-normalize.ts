/** 去掉模型可能包裹的全文 ```markdown 围栏 */
export function normalizeMarkdownForPdf(text: string): string {
  let md = text.trim();
  const fenced = md.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  if (fenced?.[1]) {
    md = fenced[1].trim();
  }
  return md;
}

export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /^#{1,6}\s+/m.test(t) ||
    /^\s*[-*+]\s+/m.test(t) ||
    /\*\*[^*]+\*\*/.test(t) ||
    /^>\s+/m.test(t)
  );
}
