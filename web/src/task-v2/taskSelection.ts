/** 与列表/抽屉里 `taskKey::subtype` 选择值一致（subtype 空时为 `taskKey::`） */
export function formatTaskSelectionKey(taskKey: string, subtype: string | null): string {
  return `${taskKey}::${subtype ?? ''}`;
}

export function parseTaskSelectionKey(raw: string): { taskKey: string; subtype: string | null } {
  const [k, st] = raw.split('::');
  return { taskKey: k || 'default', subtype: st ? st : null };
}
