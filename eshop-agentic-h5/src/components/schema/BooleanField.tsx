'use client';

import type { JsonSchemaProperty } from '@/adapters/types';
import { cn } from '@/lib/cn';

export function BooleanField({
  fieldKey,
  def,
  value,
  onChange,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: boolean) => void;
}) {
  const checked = Boolean(value);
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{def.title ?? fieldKey}</p>
        {def.description && <p className="mt-1 text-sm text-text-muted">{def.description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors pressable',
          checked ? 'bg-accent' : 'bg-surface-elevated'
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked ? 'left-7' : 'left-1'
          )}
        />
      </button>
    </div>
  );
}
