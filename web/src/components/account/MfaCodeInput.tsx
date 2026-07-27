import { useCallback, useRef } from 'react';

type MfaCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
};

/** 6 位 TOTP 输入，支持粘贴 */
export function MfaCodeInput({ value, onChange, disabled, id }: MfaCodeInputProps) {
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const applyDigits = useCallback(
    (chars: string[]) => {
      const next = chars.join('').replace(/\D/g, '').slice(0, 6);
      onChange(next);
      const focusIdx = Math.min(next.length, 5);
      window.requestAnimationFrame(() => refs.current[focusIdx]?.focus());
    },
    [onChange]
  );

  return (
    <div className="mfa-code-input" id={id}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="mfa-code-input__cell"
          value={d.trim()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`digit ${i + 1}`}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1);
            const next = digits.map((x) => x.trim());
            next[i] = ch;
            applyDigits(next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i]?.trim() && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (text) onChange(text);
          }}
        />
      ))}
    </div>
  );
}
