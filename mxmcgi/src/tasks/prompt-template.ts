import type { JsonSchemaV2, PromptTemplateConfig } from './types';
import { ConfigurationError } from './errors';

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function collectTemplateVars(s: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(s)) !== null) {
    out.push(m[1]);
  }
  return Array.from(new Set(out));
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, unknown>
): string {
  return template.replace(VAR_RE, (_all, key: string) => {
    const v = vars[key];
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    // 对象/数组默认 JSON 串，便于可控复现
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  });
}

/**
 * 将旧版 system / user / output 三段模板（未插值）合并为单段 unifiedTemplate，
 * 与原先 `renderPromptFromTemplate` 的拼接规则一致。
 */
export function composeLegacyPromptToUnified(p: {
  systemTemplate?: string;
  userTemplate?: string;
  outputFormatTemplate?: string;
  /** 来自 prompt_engineering_config.rules_i18n 的兜底 */
  rulesFallback?: string;
  /** 来自 prompt_engineering_config.output_format_i18n 的兜底 */
  outputFormatFallback?: string;
}): string {
  const sys = (p.systemTemplate || p.rulesFallback || '').trim();
  const userTpl =
    p.userTemplate != null && String(p.userTemplate).trim() !== ''
      ? String(p.userTemplate).trim()
      : '${prompt}';
  const out = (p.outputFormatTemplate || p.outputFormatFallback || '').trim();
  const parts: string[] = [];
  if (sys) parts.push(sys);
  parts.push(`【用户需求】\n${userTpl}`);
  if (out) parts.push(`【输出要求】\n${out}`);
  return parts.join('\n\n').trim();
}

export function assertTemplateVarsAllowed(paramsSchema: JsonSchemaV2, varsUsed: string[], allowList: string[] = []): void {
  const props = (paramsSchema as any)?.properties as Record<string, unknown> | undefined;
  const allowed = new Set<string>([...Object.keys(props || {}), ...allowList]);
  const unknown = varsUsed.filter((v) => !allowed.has(v));
  if (unknown.length > 0) {
    throw new ConfigurationError(
      `Prompt 模板引用了未在 formSchema.properties 中声明的变量: ${unknown.join(', ')}`
    );
  }
}

export function renderPromptFromTemplate(args: {
  prompt: PromptTemplateConfig;
  paramsSchema: JsonSchemaV2;
  params: Record<string, unknown>;
  contextVars?: Record<string, unknown>;
}): { finalPrompt: string; varsUsed: string[] } {
  const { prompt, paramsSchema, params, contextVars } = args;
  const vars = { ...(contextVars || {}), ...(params || {}) } as Record<string, unknown>;

  let body = (prompt.unifiedTemplate || '').trim();
  if (!body) {
    body = composeLegacyPromptToUnified({
      systemTemplate: prompt.systemTemplate,
      userTemplate: prompt.userTemplate,
      outputFormatTemplate: prompt.outputFormatTemplate,
    });
  }

  const uniVars = collectTemplateVars(body);
  assertTemplateVarsAllowed(paramsSchema, uniVars, ['userId', 'taskId', 'date', 'timestamp', 'uuid']);
  const finalPrompt = interpolateTemplate(body, vars).trim();
  return { finalPrompt, varsUsed: uniVars };
}

