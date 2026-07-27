'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { BottomSheet } from '@/components/schema/BottomSheet';
import { cn } from '@/lib/cn';

export type PickerOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/** iOS 风格：点击行 → 底部 Sheet + 取消/完成工具栏 + 列表点选 */
export function IosPickerField({
  label,
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);

  useEffect(() => {
    if (!open) setPending(value);
  }, [value, open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const close = () => setOpen(false);

  const confirm = () => {
    onChange(pending);
    close();
  };

  return (
    <div className="space-y-2">
      <p className="section-label px-0.5">{label}</p>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left pressable',
          'shadow-[inset_0_1px_2px_rgba(26,22,20,0.03)]',
          disabled && 'opacity-50'
        )}
      >
        <span className={cn('text-[15px]', value ? 'text-text' : 'text-text-muted')}>
          {currentLabel}
        </span>
        <ChevronRight size={18} className="shrink-0 text-text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={close}
        title={label}
        iosToolbar
        onCancel={close}
        onConfirm={confirm}
      >
        <ul className="divide-y divide-border/80 touch-pan-y" role="listbox">
          {options.map((opt) => {
            const selected = pending === opt.value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setPending(opt.value);
                    onChange(opt.value);
                    close();
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-1 py-3.5 text-[17px] select-none',
                    selected ? 'font-medium text-accent' : 'text-text'
                  )}
                >
                  <span>{opt.label}</span>
                  {selected && <Check size={20} className="text-accent" strokeWidth={2.5} />}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </div>
  );
}
