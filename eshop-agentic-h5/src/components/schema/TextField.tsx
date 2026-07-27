'use client';

import type { JsonSchemaProperty } from '@/adapters/types';

export function TextField({
  fieldKey,
  def,
  value,
  onChange,
  multiline = false,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: string) => void;
  multiline?: boolean;
}) {
  const str = String(value ?? '');
  return (
    <div className="space-y-2">
      <label className="font-medium" htmlFor={fieldKey}>
        {def.title ?? fieldKey}
      </label>
      {def.description && <p className="text-sm text-text-muted">{def.description}</p>}
      {multiline ? (
        <textarea
          id={fieldKey}
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-surface-elevated px-4 py-3 outline-none focus:ring-1 focus:ring-accent"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder="选填"
        />
      ) : (
        <input
          id={fieldKey}
          className="w-full rounded-xl border border-border bg-surface-elevated px-4 py-3 outline-none focus:ring-1 focus:ring-accent"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder="选填"
        />
      )}
    </div>
  );
}
