function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 默认任务展示名：子类型显示名（或 taskKey）+ 本地时间戳 */
export function buildDefaultTaskLabelFromSelection(parts: {
  subtypeLabel: string;
  subtype: string | null;
  taskLabel: string;
  taskKey: string;
}): string {
  const sub =
    parts.subtypeLabel.trim() ||
    (parts.subtype && parts.subtype.trim() !== '' ? parts.subtype.trim() : '') ||
    parts.taskLabel.trim() ||
    parts.taskKey;
  const d = new Date();
  const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${sub}-${ts}`;
}
