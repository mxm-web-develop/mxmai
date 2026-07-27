/**
 * 敏感词解析：按 (scope, type, subtype) 从 DB 取绑定的敏感词表并合并为数组；无绑定则回退代码内默认列表
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import { sensitivesWords } from '../sensitive/words';

/**
 * 按 list id 合并敏感词（pipeline step.params.listIds）
 */
export async function getSensitiveWordsForListIds(listIds: string[]): Promise<string[]> {
  const ids = [...new Set(listIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  try {
    const repo = RepositoryFactory.createSensitiveWordRepository();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of ids) {
      const list = await repo.findListById(id);
      if (!list?.is_active) continue;
      const words = await repo.listWordsByListId(id);
      for (const row of words) {
        const w = row.word.trim();
        if (w && !seen.has(w)) {
          seen.add(w);
          result.push(w);
        }
      }
    }
    return result;
  } catch (_) {
    return [];
  }
}

/**
 * 获取指定细分业务应使用的敏感词数组
 * 先查 DB 绑定，有则返回合并后的词表；无则返回代码内 sensitivesWords（与现有行为一致）
 */
export async function getSensitiveWordsForSlot(
  scope: string,
  type: string,
  subtype?: string | null
): Promise<string[]> {
  try {
    const repo = RepositoryFactory.createSensitiveWordRepository();

    // 1. 先按完整 key (scope, type, subtype) 查找（细分业务专用词表）
    const primary = await repo.getWordsForSlot(scope, type, subtype ?? null);
    if (primary.length > 0) return primary;

    // 2. 若指定了 subtype，但未配置对应绑定，则回退到「该 type 下通用」（subtype = null）
    if (subtype != null && subtype !== '') {
      const fallback = await repo.getWordsForSlot(scope, type, null);
      if (fallback.length > 0) return fallback;
    }

    // 3. 若该 type 也未配置绑定，则回退到「该 scope 下通用」：
    // - 约定：在 bindings 表里使用 type="*" 表示整个 scope 的通用绑定
    const scopeWide = await repo.getWordsForSlot(scope, '*', null);
    if (scopeWide.length > 0) return scopeWide;
  } catch (_) {
    // 忽略 DB 错误，使用回退
  }
  return sensitivesWords;
}
