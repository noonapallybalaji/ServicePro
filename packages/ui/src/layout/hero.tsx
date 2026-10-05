import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';

interface HeroBandProps extends ComponentProps<'section'> {
  /** Illustration on the right; hidden on phones so the content stays first. */
  art?: ReactNode;
  /** `md` for dense work views (dashboard), `lg` for home and marketing views. */
  artSize?: 'md' | 'lg';
}

/**
 * The colourful brand band at the top of a home view (technician Today, admin dashboard,
 * customer pages). Text inside flips to white via data-surface="brand"; put light cards
 * inside with data-surface="light".
 */
export function HeroBand({ art, artSize = 'lg', className, children, ...props }: HeroBandProps) {
  return (
    <section
      data-surface="brand"
      className={cn('surface-hero relative isolate overflow-hidden rounded-sheet p-5 md:p-8', className)}
      {...props}
    >
      <div aria-hidden className="bg-dots absolute inset-y-0 right-0 -z-10 w-1/2" />
      <div className="flex items-center gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
        {art ? (
          <div className={cn('hidden w-2/5 shrink-0 md:block [&>svg]:h-auto [&>svg]:w-full', artSize === 'md' ? 'max-w-xs' : 'max-w-dialog')}>{art}</div>
        ) : null}
      </div>
    </section>
  );
}
