import { CircleAlert } from 'lucide-react';
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/cn';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Wires a control to its label, hint and error (id, aria-describedby, aria-invalid)
 * so individual inputs never have to.
 */
export function useFieldControl() {
  return useContext(FieldContext);
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- association is via htmlFor at call sites
    <label className={cn('text-sm font-semibold text-foreground', className)} {...props} />
  );
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  /** Shown below the control, announced to screen readers, sets aria-invalid. */
  error?: ReactNode;
  /**
   * Forms are short, so most fields are required. We mark the exceptions as
   * "(optional)" instead of decorating every required field with an asterisk.
   */
  optional?: boolean;
  optionalLabel?: string;
  className?: string;
}

export function Field({
  label,
  children,
  hint,
  error,
  optional = false,
  optionalLabel = 'optional',
  className,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext value={{ id, describedBy, invalid: Boolean(error), required: !optional }}>
      <div className={cn('flex flex-col gap-2', className)}>
        <Label htmlFor={id}>
          {label}
          {optional ? (
            <span className="font-normal text-foreground-muted"> ({optionalLabel})</span>
          ) : null}
        </Label>
        {children}
        {error ? (
          <p id={errorId} className="flex items-start gap-1 text-sm font-medium text-error">
            <span className="flex h-5 shrink-0 items-center">
              <CircleAlert aria-hidden className="size-4" />
            </span>
            <span>{error}</span>
          </p>
        ) : null}
        {hint ? (
          <p id={hintId} className="text-sm text-foreground-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}
