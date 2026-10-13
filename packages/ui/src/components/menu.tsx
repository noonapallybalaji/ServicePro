import { DropdownMenu } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/*
 * Dropdown menu (account menu, row actions). Radix handles keyboard navigation, focus return and
 * typeahead; items can render router links with `asChild`.
 */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, align = 'end', sideOffset = 8, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-(--z-overlay) min-w-56 rounded-card border border-border bg-surface p-1 text-foreground shadow-lg',
          'data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex h-10 cursor-pointer items-center gap-3 rounded-control px-3 text-sm font-semibold text-foreground-secondary outline-none select-none pointer-coarse:h-12',
        'data-[highlighted]:bg-surface-sunken data-[highlighted]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn('flex flex-col px-3 py-2', className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}
