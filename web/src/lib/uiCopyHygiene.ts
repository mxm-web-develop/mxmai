/**
 * 用户可见文案卫生：禁止把 schema / 管道内部设计直接露到 UI。
 * @see .cursor/rules/ui-no-internal-leak.mdc
 * @see docs/adr/user-facing-error-policy.md
 */

import { toUserFacingErrorMessage, looksLikeLeakyErrorText } from './platformErrors';

const INTERNAL_COPY_RE =
  /\b(style|x-show-when|x-hide-when|x-ui-type|x-card-tag|x-asset-source|x-zone|x-collect)\s*=|writing_folder_id|style_custom|article_structure_custom|industry_custom|folder_param|inject_as_param|need:\s*|params\.|enum\s*=|taskKey|subtype|unifiedTemplate|formSchema/i;

const TECHNICAL_ERROR_RE =
  /JSON Schema|additional properties|instancePath|ValidationError|ajv|must NOT have|must match|must be|required property/i;

/** 像给工程师看的说明，不应直接展示给终端用户 */
export function looksLikeInternalUiCopy(text: string | null | undefined): boolean {
  const s = String(text ?? '').trim();
  if (!s) return false;
  return INTERNAL_COPY_RE.test(s);
}

/** 过滤内部说明；空或内部文案时回退到 fallback */
export function userFacingCopy(
  text: string | null | undefined,
  fallback = ''
): string {
  const s = String(text ?? '').trim();
  if (!s || looksLikeInternalUiCopy(s)) return fallback;
  return s;
}

/**
 * 任务/引导流程中的错误文案：技术校验与上游泄漏改成人话。
 * 新代码优先用 toUserFacingError / toUserFacingErrorMessage（可传 isAdmin）。
 */
export function userFacingTaskError(
  text: string | null | undefined,
  fallback = '操作失败，请检查填写后重试'
): string {
  const s = String(text ?? '').trim();
  if (!s) return fallback;
  if (/参数校验失败|additional properties|JSON Schema/i.test(s)) {
    return '填写内容有误或系统配置不同步，请返回上一步检查后重试；若刚更新过业务，请刷新页面再试';
  }
  if (TECHNICAL_ERROR_RE.test(s) || looksLikeInternalUiCopy(s) || looksLikeLeakyErrorText(s)) {
    return toUserFacingErrorMessage(s, { fallback });
  }
  return s;
}

export { toUserFacingError, toUserFacingErrorMessage } from './platformErrors';
