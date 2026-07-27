'use client';

import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { JsonSchemaProperty } from '@/adapters/types';
import { resolveEnumOptions } from '@/lib/enum-display';
import { OUTPUT_GRID_LABELS, type OutputGridLayout } from '@/lib/output-grid';
import { BottomSheet } from './BottomSheet';
import { cn } from '@/lib/cn';

export function SelectionField({
  fieldKey,
  def,
  value,
  onChange,
  fieldHints,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: string) => void;
  fieldHints?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState('');
  const options = resolveEnumOptions(def, { fieldKey, fieldHints });
  const current = String(value ?? def.default ?? options[0]?.value ?? '');
  const currentLabel = options.find((o) => o.value === current)?.label ?? '请选择';

  const openSheet = () => {
    setPending(current);
    setOpen(true);
  };
  const closeSheet = () => setOpen(false);

  const isGrid = fieldKey === 'output_grid' || def.title?.includes('布局');

  return (
    <div className="space-y-2">
      <p className="font-medium">{def.title ?? fieldKey}</p>
      {def.description && <p className="text-sm text-text-muted">{def.description}</p>}

      {isGrid ? (
        <div className="grid grid-cols-2 gap-3">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded-xl border p-4 pressable',
                current === opt.value ? 'border-accent bg-accent/10' : 'border-border bg-surface'
              )}
            >
              <GridPreview layout={opt.value} />
              <p className="mt-2 text-center text-sm">{opt.label}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={openSheet}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 pressable"
          >
            <span className="text-[15px] text-text">{currentLabel}</span>
            <ChevronRight size={18} className="shrink-0 text-text-muted" />
          </button>
          <BottomSheet
            open={open}
            onClose={closeSheet}
            title={def.title ?? '选择'}
            iosToolbar
            onCancel={closeSheet}
            onConfirm={() => {
              onChange(pending);
              closeSheet();
            }}
          >
            <ul className="divide-y divide-border/80 touch-pan-y">
              {options.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(opt.value);
                      onChange(opt.value);
                      closeSheet();
                    }}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 py-3.5 text-left select-none active:bg-surface-muted/80',
                      pending === opt.value ? 'font-medium text-accent' : 'text-text'
                    )}
                  >
                    <span className="flex w-full items-center justify-between text-[17px]">
                      {opt.label}
                      {pending === opt.value && (
                        <Check size={20} className="text-accent" strokeWidth={2.5} />
                      )}
                    </span>
                    {opt.description && (
                      <span className="pr-6 text-xs leading-relaxed text-text-muted line-clamp-2">
                        {opt.description}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </BottomSheet>
        </>
      )}
    </div>
  );
}

function GridPreview({ layout }: { layout: string }) {
  const count = layout === '3x3' ? 9 : layout === '2x2' ? 4 : 1;
  const cols = count === 9 ? 3 : count === 4 ? 2 : 1;
  const label = OUTPUT_GRID_LABELS[layout as OutputGridLayout];
  return (
    <div>
      <div className={cn('grid gap-0.5', cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="aspect-square rounded bg-border/60" />
        ))}
      </div>
      {!label && <p className="sr-only">{layout}</p>}
    </div>
  );
}
