import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/*
 * Data tables for desktop (RESPONSIVE-STRATEGY.md §5.3). Below `md` screens show cards
 * instead; the table scrolls horizontally rather than squashing columns if it must render.
 */

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('sticky top-0 z-(--z-sticky) border-b border-border bg-surface', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-interactive hover:bg-surface-sunken', className)} {...props} />;
}

export function TableHeaderCell({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-3 text-caption font-semibold whitespace-nowrap text-foreground-muted uppercase', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle text-foreground', className)} {...props} />;
}
