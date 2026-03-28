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

  const systemVars = collectTemplateVars(prompt.systemTemplate || '');
  const userVars = collectTemplateVars(prompt.userTemplate || '');
  const outVars = collectTemplateVars(prompt.outputFormatTemplate || '');
  const varsUsed = Array.from(new Set([...systemVars, ...userVars, ...outVars]));

  // 允许少量运行时上下文变量：userId/taskId/date/timestamp/uuid
  assertTemplateVarsAllowed(paramsSchema, varsUsed, ['userId', 'taskId', 'date', 'timestamp', 'uuid']);

  const system = interpolateTemplate(prompt.systemTemplate || '', vars).trim();
  const user = (prompt.userTemplate ? interpolateTemplate(prompt.userTemplate, vars) : String(params.prompt ?? '')).trim();
  const output = interpolateTemplate(prompt.outputFormatTemplate || '', vars).trim();

  const parts = [
    system,
    user ? `【用户需求】\n${user}` : '',
    output ? `【输出要求】\n${output}` : '',
  ].filter(Boolean);

  return { finalPrompt: parts.join('\n\n').trim(), varsUsed };
}

