import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/** Shared by Button and IconButton so both always look like one family. */
export const BUTTON_BASE =
  'pressable transition-interactive relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold select-none disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:shrink-0';

export const BUTTON_VARIANT_CLASSES = {
  /** One per screen region. The thing we want the person to do. */
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
  outline: 'border border-input bg-surface text-foreground hover:border-input-hover hover:bg-surface-sunken',
  ghost: 'text-foreground hover:bg-surface-sunken',
  destructive: 'bg-error text-error-foreground hover:bg-error-hover',
} as const;

const buttonVariants = cva(BUTTON_BASE, {
  variants: {
    variant: BUTTON_VARIANT_CLASSES,
    /*
     * Height follows the INPUT MODALITY, not the viewport: touch screens get larger
     * targets (48/56px) even on a tablet in landscape; mouse users get denser controls.
     */
    size: {
      sm: 'h-8 px-3 text-sm pointer-coarse:h-10 [&_svg]:size-4',
      md: 'h-10 px-4 text-button pointer-coarse:h-12 pointer-coarse:px-5 [&_svg]:size-4',
      lg: 'h-12 px-6 text-button-lg pointer-coarse:h-14 [&_svg]:size-5',
    },
    fullWidth: {
      true: 'w-full',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export type ButtonVariant = keyof typeof BUTTON_VARIANT_CLASSES;

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router Link) with button styling. */
  asChild?: boolean;
  /** Shows a spinner, keeps the button's width, and blocks repeat submits. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);

  if (asChild) {
    return (
      <Slot.Slot className={classes} {...props}>
        {children}
      </Slot.Slot>
    );
  }

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <LoaderCircle aria-hidden className="absolute animate-spin" />
        </>
      ) : (
        children
      )}
    </button>
  );
}

export { buttonVariants };
