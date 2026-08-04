/**
 * 写作/音频等业务选择列表分组。
 * 按展示分类名（taskLabel）合并；同属 writing/generator 的 subtype 会自然落在「文稿」下。
 */
import type { TaskFormConfigListItem } from '../api/client';
import { type AppLocale, pickDisplayLocalizedString } from '../i18n/appLocale';
import { formatTaskSelectionKey } from '../task-v2/taskSelection';

function pickI18n(
  locale: AppLocale,
  primary: string | null | undefined,
  map: Record<string, string> | null | undefined,
  fallback: string
): string {
  return pickDisplayLocalizedString(primary, map, locale, fallback);
}

export type BizListGroup = {
  groupKey: string;
  groupLabel: string;
  items: Array<{
    key: string;
    taskKey: string;
    subtype: string | null;
    title: string;
    description: string;
  }>;
};

function normalizeGroupLabel(label: string): string {
  return label.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function groupBusinesses(
  options: TaskFormConfigListItem[],
  locale: AppLocale
): BizListGroup[] {
  const map = new Map<string, BizListGroup>();
  for (const o of options) {
    const groupLabel = normalizeGroupLabel(
      pickI18n(locale, o.taskLabel, o.taskLabelI18n, o.taskKey)
    );
    const title = pickI18n(
      locale,
      o.subtypeLabel,
      o.subtypeLabelI18n,
      o.subtype || o.taskKey
    );
    const description = pickI18n(
      locale,
      o.description,
      o.descriptionI18n,
      '选择此业务开始引导填写'
    );
    // 分类展示名优先；勿用 taskKey 作分组键（否则「文稿」会拆成多段）
    const groupKey = groupLabel || o.taskKey;
    let g = map.get(groupKey);
    if (!g) {
      g = { groupKey, groupLabel: groupLabel || o.taskKey, items: [] };
      map.set(groupKey, g);
    }
    g.items.push({
      key: formatTaskSelectionKey(o.taskKey, o.subtype),
      taskKey: o.taskKey,
      subtype: o.subtype,
      title,
      description,
    });
  }
  return [...map.values()];
}
