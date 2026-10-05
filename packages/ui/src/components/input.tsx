import { ChevronDown, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { useFieldControl } from './field';

/*
 * Text is always 16px in controls: smaller text makes iOS Safari zoom the page on focus,
 * and 16px is the readable minimum for customers on budget phones.
 */
export const CONTROL_BASE =
  'transition-interactive w-full rounded-control border border-input bg-surface text-body text-foreground placeholder:text-foreground-muted hover:border-input-hover focus-visible:border-primary aria-invalid:border-error disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-foreground-muted';

const CONTROL_HEIGHT = 'h-10 pointer-coarse:h-12';

/** Merge explicit aria/id props with those supplied by an enclosing <Field>. */
function useControlProps(props: {
  id?: string | undefined;
  required?: boolean | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: ComponentProps<'input'>['aria-invalid'];
}) {
  const field = useFieldControl();
  return {
    id: props.id ?? field?.id,
    required: props.required ?? field?.required,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid ? true : undefined),
  };
}

export interface InputProps extends ComponentProps<'input'> {
  leadingIcon?: LucideIcon;
  /** Slot inside the right edge — e.g. a clear IconButton or a unit like "km". */
  trailing?: ReactNode;
}

export function Input({
  className,
  leadingIcon: LeadingIcon,
  trailing,
  id,
  required,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: InputProps) {
  const controlProps = useControlProps({
    id,
    required,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
  });

  const input = (
    <input
      {...controlProps}
      className={cn(CONTROL_BASE, CONTROL_HEIGHT, 'px-4', LeadingIcon && 'pl-12', trailing && 'pr-12', className)}
      {...props}
    />
  );

  if (!LeadingIcon && !trailing) return input;

  return (
    <div className="relative">
      {LeadingIcon ? (
        <LeadingIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-foreground-muted"
        />
      ) : null}
      {input}
      {trailing ? <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div> : null}
    </div>
  );
}

export function Textarea({
  className,
  id,
  required,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: ComponentProps<'textarea'>) {
  const controlProps = useControlProps({
    id,
    required,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
  });
  return (
    <textarea
      {...controlProps}
      className={cn(CONTROL_BASE, 'min-h-24 resize-y px-4 py-3', className)}
      {...props}
    />
  );
}

/**
 * Native <select>: on phones it opens the OS picker, which is faster, accessible and
 * familiar. A custom listbox is only worth it for searchable/multi-select cases.
 */
export function Select({
  className,
  id,
  required,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  children,
  ...props
}: ComponentProps<'select'>) {
  const controlProps = useControlProps({
    id,
    required,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
  });
  return (
    <div className="relative">
      <select
        {...controlProps}
        className={cn(CONTROL_BASE, CONTROL_HEIGHT, 'appearance-none pr-12 pl-4', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-foreground-muted"
      />
    </div>
  );
}
