import type { TaskTemplateDraft } from './AdminBusiness.types';

/**
 * 将 pipeline.pre.interactiveCard.fields 的 title/enum/required 写回 formSchema.properties，
 * 避免交互卡与 schema 分叉（C 端 createGuide 优先卡字段，schema 仍需对齐）。
 */
export function syncInteractiveCardFieldsToFormSchema(draft: TaskTemplateDraft): TaskTemplateDraft {
  const pre = draft.pipeline?.pre;
  if (!Array.isArray(pre)) return draft;
  const card = pre.find((s) => s?.step === 'interactiveCard');
  if (!card) return draft;
  const rawFields = Array.isArray(card.params?.fields) ? (card.params!.fields as unknown[]) : [];
  if (rawFields.length === 0) return draft;

  const props = {
    ...((draft.formSchema?.properties ?? {}) as Record<string, Record<string, unknown>>),
  };
  const requiredSet = new Set((draft.formSchema?.required ?? []).map(String));
  let changed = false;

  for (const raw of rawFields) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const f = raw as Record<string, unknown>;
    const name = String(f.name ?? '').trim();
    if (!name) continue;
    const prev = (props[name] && typeof props[name] === 'object' ? { ...props[name] } : {}) as Record<
      string,
      unknown
    >;
    if (typeof f.type === 'string') prev.type = f.type;
    else if (!prev.type) prev.type = 'string';
    if (typeof f.title === 'string') prev.title = f.title;
    if (typeof f.description === 'string') prev.description = f.description;
    if (Array.isArray(f.enum)) prev.enum = f.enum.map(String);
    if (typeof f['x-ui'] === 'string') prev['x-ui'] = f['x-ui'];
    if (f.default != null) prev.default = f.default;
    if (f.required === true) requiredSet.add(name);
    else if (f.required === false) requiredSet.delete(name);
    props[name] = prev;
    changed = true;
  }

  if (!changed) return draft;
  return {
    ...draft,
    formSchema: {
      ...(draft.formSchema ?? { type: 'object' }),
      type: 'object',
      properties: props,
      required: [...requiredSet],
    },
    contractSchema: {
      ...(draft.contractSchema ?? draft.formSchema ?? { type: 'object' }),
      type: 'object',
      properties: props,
      required: [...requiredSet],
    },
  };
}
