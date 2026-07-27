/** 与列表/抽屉里 `taskKey::subtype` 选择值一致（subtype 空时为 `taskKey::`） */
export function formatTaskSelectionKey(taskKey: string, subtype: string | null): string {
  return `${taskKey}::${subtype ?? ''}`;
}

export function parseTaskSelectionKey(raw: string): { taskKey: string; subtype: string | null } {
  const parts = String(raw).split('::');
  const k = parts[0] ?? '';
  const st = parts.length > 1 ? parts.slice(1).join('::') : '';
  return { taskKey: k, subtype: st ? st : null };
}
