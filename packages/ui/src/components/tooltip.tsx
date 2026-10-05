import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/** Mount once at the app root. */
export const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/**
 * Tooltips are a desktop nicety: touch devices never see them, so they must never
 * hold information that is unavailable elsewhere.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-(--z-tooltip) max-w-xs rounded-md bg-surface-inverse px-3 py-2 text-sm text-foreground-inverse shadow-md',
            'data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in',
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
