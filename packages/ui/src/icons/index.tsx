import {
  AirVent,
  Microwave,
  Refrigerator,
  Tv,
  WashingMachine,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

import { cn } from '../lib/cn';

/** Icon sizes. Icons sit on the 4px grid: 16 (inline), 20 (default), 24 (prominent). */
export const ICON_SIZE_CLASSES = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} as const;

export type IconSize = keyof typeof ICON_SIZE_CLASSES;

/**
 * Appliance category → icon. Keys match `service_categories.code` (PLAN.md §7.5).
 * New categories fall back to a generic icon at the call site.
 */
export const CATEGORY_ICONS = {
  AC: AirVent,
  TV: Tv,
  FRIDGE: Refrigerator,
  WASHER: WashingMachine,
  MICROWAVE: Microwave,
} as const satisfies Record<string, LucideIcon>;

export type CategoryCode = keyof typeof CATEGORY_ICONS;

interface IconProps extends Omit<LucideProps, 'size' | 'ref'> {
  icon: LucideIcon;
  size?: IconSize;
  /** Give a label only when the icon carries meaning on its own. Otherwise it is decorative. */
  label?: string;
}

export function Icon({ icon: IconComponent, size = 'md', label, className, ...props }: IconProps) {
  return (
    <IconComponent
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cn(ICON_SIZE_CLASSES[size], 'shrink-0', className)}
      {...props}
    />
  );
}
