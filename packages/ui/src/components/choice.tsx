import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * Checkbox, Radio and Switch share one layout: control on the left, label + optional
 * description on the right. The whole label row is clickable, so the touch target is the
 * row, not the 20px box.
 */

interface ChoiceLayoutProps {
  id: string;
  label: ReactNode;
  description?: ReactNode | undefined;
  descriptionId: string | undefined;
  control: ReactNode;
  className?: string | undefined;
}

function ChoiceLayout({ id, label, description, descriptionId, control, className }: ChoiceLayoutProps) {
  return (
    <div className={cn('flex items-start gap-3 py-1 pointer-coarse:py-2', className)}>
      <span className="flex h-6 items-center">{control}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="cursor-pointer text-body font-medium text-foreground">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-sm text-foreground-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const BOX_BASE =
  'transition-interactive peer flex shrink-0 items-center justify-center border border-input bg-surface hover:border-input-hover disabled:cursor-not-allowed disabled:opacity-50';

interface CheckboxProps extends Omit<ComponentProps<typeof CheckboxPrimitive.Root>, 'children'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, id, className, ...props }: CheckboxProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <ChoiceLayout
      id={controlId}
      label={label}
      description={description}
      descriptionId={descriptionId}
      className={className}
      control={
        <CheckboxPrimitive.Root
          id={controlId}
          aria-describedby={descriptionId}
          className={cn(
            BOX_BASE,
            'size-5 rounded-sm text-primary-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary',
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator>
            <Check aria-hidden className="size-4" strokeWidth={3} />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
      }
    />
  );
}

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioPrimitive.Root>) {
  return <RadioPrimitive.Root className={cn('flex flex-col gap-2', className)} {...props} />;
}

interface RadioProps extends Omit<ComponentProps<typeof RadioPrimitive.Item>, 'children'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Radio({ label, description, id, className, ...props }: RadioProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <ChoiceLayout
      id={controlId}
      label={label}
      description={description}
      descriptionId={descriptionId}
      className={className}
      control={
        <RadioPrimitive.Item
          id={controlId}
          aria-describedby={descriptionId}
          className={cn(BOX_BASE, 'size-5 rounded-full data-[state=checked]:border-primary')}
          {...props}
        >
          <RadioPrimitive.Indicator className="size-3 rounded-full bg-primary" />
        </RadioPrimitive.Item>
      }
    />
  );
}

interface RadioCardProps extends Omit<ComponentProps<typeof RadioPrimitive.Item>, 'children' | 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Leading visual — typically an appliance or issue icon. */
  media?: ReactNode;
}

/**
 * Large selectable card. The core mobile pattern for "pick your appliance / pick your
 * problem": one tap, no typing, generous target. Use inside <RadioGroup>.
 * Content is phrasing-only (spans) because the item renders as a <button>.
 */
export function RadioCard({ title, description, media, className, ...props }: RadioCardProps) {
  return (
    <RadioPrimitive.Item
      className={cn(
        'pressable transition-interactive group flex w-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-left',
        'hover:border-border-strong data-[state=checked]:border-primary data-[state=checked]:bg-primary-subtle',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {media ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-foreground-secondary group-data-[state=checked]:bg-surface group-data-[state=checked]:text-primary">
          {media}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-semibold text-foreground">{title}</span>
        {description ? <span className="text-sm text-foreground-secondary">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-input group-data-[state=checked]:border-primary"
      >
        <RadioPrimitive.Indicator className="size-3 rounded-full bg-primary" />
      </span>
    </RadioPrimitive.Item>
  );
}

interface SwitchProps extends Omit<ComponentProps<typeof SwitchPrimitive.Root>, 'children'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Switch({ label, description, id, className, ...props }: SwitchProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <ChoiceLayout
      id={controlId}
      label={label}
      description={description}
      descriptionId={descriptionId}
      className={className}
      control={
        <SwitchPrimitive.Root
          id={controlId}
          aria-describedby={descriptionId}
          className={cn(
            'transition-interactive inline-flex h-6 w-10 shrink-0 items-center rounded-pill bg-input p-0',
            'data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
          )}
          {...props}
        >
          <SwitchPrimitive.Thumb className="transition-interactive ml-1 block size-4 rounded-full bg-surface shadow-sm data-[state=checked]:translate-x-4" />
        </SwitchPrimitive.Root>
      }
    />
  );
}
