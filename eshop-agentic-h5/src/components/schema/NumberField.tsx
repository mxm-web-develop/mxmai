'use client';

import { Minus, Plus } from 'lucide-react';
import type { JsonSchemaProperty } from '@/adapters/types';

export function NumberField({
  fieldKey,
  def,
  value,
  onChange,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: number) => void;
}) {
  const min = def.minimum ?? 1;
  const max = def.maximum ?? 99;
  const num = Number(value ?? def.default ?? min);

  const step = (delta: number) => {
    onChange(Math.min(max, Math.max(min, num + delta)));
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
      <div>
        <p className="font-medium">{def.title ?? fieldKey}</p>
        {def.description && <p className="text-sm text-text-muted">{def.description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={num <= min}
          className="touch-target flex items-center justify-center rounded-full bg-surface-elevated pressable disabled:opacity-40"
        >
          <Minus size={18} />
        </button>
        <span className="min-w-[2ch] text-center text-lg font-medium">{num}</span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={num >= max}
          className="touch-target flex items-center justify-center rounded-full bg-surface-elevated pressable disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
