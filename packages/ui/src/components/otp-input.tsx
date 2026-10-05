import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';
import { useFieldControl } from './field';

interface OtpInputProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'value' | 'maxLength'> {
  length: number;
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * One-time codes (login OTP, the customer's completion code). A single native input — not
 * one box per digit — so paste, SMS autofill (`autocomplete="one-time-code"`) and screen
 * readers all work. Large tabular digits with generous spacing read like separate boxes.
 */
export function OtpInput({ length, value, onValueChange, className, id, ...props }: OtpInputProps) {
  const field = useFieldControl();
  return (
    <input
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`[0-9]{${length}}`}
      maxLength={length}
      value={value}
      onChange={(event) => onValueChange(event.target.value.replace(/\D/g, '').slice(0, length))}
      className={cn(
        'transition-interactive h-14 w-full rounded-control border border-input bg-surface px-4 text-center text-stat-sm tracking-widest text-foreground tabular-nums',
        'placeholder:text-foreground-muted hover:border-input-hover focus-visible:border-primary aria-invalid:border-error',
        className,
      )}
      placeholder={'•'.repeat(length)}
      {...props}
    />
  );
}
