import { Input } from 'antd';
import './color-picker-field.css';

const HEX6 = /^#([0-9A-Fa-f]{6})$/;

function normalizeHex(raw: string): string | null {
  const t = raw.trim();
  if (HEX6.test(t)) return t.toUpperCase();
  const short = /^#([0-9A-Fa-f]{3})$/.exec(t);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

function fallbackHex(value: unknown, preset?: string): string {
  const fromValue = typeof value === 'string' ? normalizeHex(value) : null;
  if (fromValue) return fromValue;
  const fromPreset = preset ? normalizeHex(preset) : null;
  return fromPreset ?? '#002FA7';
}

export function ColorPickerField({
  value,
  onChange,
  disabled = false,
  placeholder = '#002FA7',
  preset,
  allowEmpty = false,
}: {
  value: unknown;
  onChange: (hex: string) => void;
  disabled?: boolean;
  placeholder?: string;
  preset?: string;
  allowEmpty?: boolean;
}) {
  const isEmpty = value == null || (typeof value === 'string' && value.trim() === '');
  const hex = isEmpty && allowEmpty ? null : fallbackHex(value, preset);

  const commit = (next: string) => {
    const normalized = normalizeHex(next);
    if (normalized) onChange(normalized);
  };

  return (
    <div className={`color-picker-field${disabled ? ' color-picker-field--disabled' : ''}`}>
      <label className="color-picker-field__swatch-wrap" aria-hidden={disabled}>
        <span
          className={`color-picker-field__swatch${hex ? '' : ' color-picker-field__swatch--empty'}`}
          style={hex ? { backgroundColor: hex } : undefined}
        />
        <input
          type="color"
          className="color-picker-field__native"
          value={hex ?? '#002FA7'}
          disabled={disabled}
          onChange={(e) => commit(e.target.value)}
        />
      </label>
      <Input
        className="color-picker-field__hex"
        value={typeof value === 'string' ? value : hex ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        allowClear={allowEmpty}
        onChange={(e) => {
          const raw = e.target.value;
          if (allowEmpty && raw.trim() === '') {
            onChange('');
            return;
          }
          onChange(raw);
          const normalized = normalizeHex(raw);
          if (normalized) onChange(normalized);
        }}
        onBlur={(e) => {
          const raw = e.target.value;
          if (allowEmpty && raw.trim() === '') {
            onChange('');
            return;
          }
          const normalized = normalizeHex(raw);
          if (normalized) onChange(normalized);
        }}
      />
    </div>
  );
}
