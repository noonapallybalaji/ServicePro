import { cva, type VariantProps } from 'class-variance-authority';
import { Avatar as AvatarPrimitive } from 'radix-ui';

import { cn } from '../lib/cn';
import { getInitials } from '../lib/format';

const avatarVariants = cva(
  'relative inline-flex shrink-0 overflow-hidden rounded-full bg-primary-subtle font-semibold text-primary-subtle-foreground',
  {
    variants: {
      size: {
        sm: 'size-8 text-caption',
        md: 'size-10 text-sm',
        lg: 'size-12 text-body',
        xl: 'size-16 text-h3',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

const STATUS_RING_SIZE = {
  sm: 'size-3',
  md: 'size-3',
  lg: 'size-4',
  xl: 'size-4',
} as const;

interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  src?: string | undefined;
  /** Literal background class for a presence dot (e.g. technician duty status). */
  statusClass?: string | undefined;
  className?: string;
}

/**
 * Image when available, initials otherwise. The image alt is empty because the person's
 * name is always rendered as text next to the avatar.
 */
export function Avatar({ name, src, size, statusClass, className }: AvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <AvatarPrimitive.Root className={avatarVariants({ size })}>
        {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
        <AvatarPrimitive.Fallback className="flex size-full items-center justify-center">
          {getInitials(name)}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {statusClass ? (
        <span
          aria-hidden
          className={cn(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-surface',
            STATUS_RING_SIZE[size ?? 'md'],
            statusClass,
          )}
        />
      ) : null}
    </span>
  );
}
