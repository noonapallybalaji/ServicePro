import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';
import { TONE_CLASSES, type Tone } from '../tokens/tones';

const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1 rounded-pill font-semibold whitespace-nowrap [&_svg]:shrink-0',
  {
    variants: {
      size: {
        sm: 'px-2 py-0 text-caption [&_svg]:size-3',
        md: 'px-3 py-1 text-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export type BadgeAppearance = 'subtle' | 'solid' | 'outline';

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  tone?: Tone;
  appearance?: BadgeAppearance;
}

export function Badge({ tone = 'neutral', appearance = 'subtle', size, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ size }), TONE_CLASSES[tone][appearance], className)} {...props} />;
}

interface StatusDotProps {
  /** Literal background class, e.g. TONE_CLASSES.success.fill or a duty-status dotClass. */
  colorClass: string;
  /** Pulsing "status LED" — only for states that are genuinely happening right now. */
  live?: boolean;
  className?: string;
}

export function StatusDot({ colorClass, live = false, className }: StatusDotProps) {
  return (
    <span aria-hidden className={cn('relative inline-flex size-2 shrink-0', className)}>
      {live ? (
        <span className={cn('absolute inset-0 animate-live-ping rounded-full', colorClass)} />
      ) : null}
      <span className={cn('relative inline-flex size-2 rounded-full', colorClass)} />
    </span>
  );
}
