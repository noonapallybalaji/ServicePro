import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';
import { BUTTON_BASE, BUTTON_VARIANT_CLASSES } from './button';
import { Tooltip } from './tooltip';

const iconButtonVariants = cva(BUTTON_BASE, {
  variants: {
    variant: BUTTON_VARIANT_CLASSES,
    size: {
      sm: 'size-8 pointer-coarse:size-10 [&_svg]:size-4',
      md: 'size-10 pointer-coarse:size-12 [&_svg]:size-5',
      lg: 'size-12 pointer-coarse:size-14 [&_svg]:size-6',
    },
  },
  defaultVariants: {
    variant: 'ghost',
    size: 'md',
  },
});

export interface IconButtonProps
  extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'>,
    VariantProps<typeof iconButtonVariants> {
  icon: LucideIcon;
  /** Required: an icon-only button has no other accessible name. */
  label: string;
  /** Also show `label` as a hover tooltip (desktop affordance; never the only explanation). */
  showTooltip?: boolean;
}

export function IconButton({
  icon: IconComponent,
  label,
  showTooltip = false,
  variant,
  size,
  className,
  type,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type ?? 'button'}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <IconComponent aria-hidden />
    </button>
  );

  return showTooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
