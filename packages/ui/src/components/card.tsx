import { cva, type VariantProps } from 'class-variance-authority';
import { Separator } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/*
 * Cards are flat by default — a hairline border on white, no shadow. Elevation is
 * reserved for things that float (popovers, sheets) or that need to lift on hover.
 */
const cardVariants = cva('rounded-card bg-surface text-foreground', {
  variants: {
    variant: {
      outline: 'border border-border',
      elevated: 'border border-border shadow-sm',
      sunken: 'bg-surface-sunken',
      /** For cards that are themselves a link/button. Pair with an interactive element. */
      interactive:
        'pressable transition-interactive border border-border text-left hover:border-border-strong hover:shadow-md',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4 md:p-5',
      lg: 'p-5 md:p-6',
    },
  },
  defaultVariants: { variant: 'outline', padding: 'md' },
});

export interface CardProps extends ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: ComponentProps<'h3'>) {
  return (
    <h3 className={cn('text-h3 text-foreground', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-foreground-secondary', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4', className)}
      {...props}
    />
  );
}

export { cardVariants };

export function Divider({ className, orientation = 'horizontal', ...props }: ComponentProps<typeof Separator.Root>) {
  return (
    <Separator.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
