import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/*
 * Layout primitives. Spacing between things is owned by the parent (Stack/Inline gap),
 * never by margins on children — this is what keeps rhythm consistent across 3 apps.
 */

const GAP = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
  16: 'gap-16',
} as const;

export type SpaceStep = keyof typeof GAP;

const stackVariants = cva('flex flex-col', {
  variants: {
    gap: GAP,
    align: {
      stretch: 'items-stretch',
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
    },
  },
  defaultVariants: { gap: 4, align: 'stretch' },
});

interface StackProps extends ComponentProps<'div'>, VariantProps<typeof stackVariants> {
  /** Render as the child element instead (e.g. <ul>, <section>, <form>). */
  asChild?: boolean;
}

/** Vertical rhythm. */
export function Stack({ gap, align, asChild = false, className, ...props }: StackProps) {
  const Comp = asChild ? Slot.Slot : 'div';
  return <Comp className={cn(stackVariants({ gap, align }), className)} {...props} />;
}

const inlineVariants = cva('flex', {
  variants: {
    gap: GAP,
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      baseline: 'items-baseline',
      stretch: 'items-stretch',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
    },
  },
  defaultVariants: { gap: 2, align: 'center', justify: 'start', wrap: true },
});

interface InlineProps extends ComponentProps<'div'>, VariantProps<typeof inlineVariants> {
  asChild?: boolean;
}

/** Horizontal grouping (buttons, badges, meta rows). Wraps by default. */
export function Inline({ gap, align, justify, wrap, asChild = false, className, ...props }: InlineProps) {
  const Comp = asChild ? Slot.Slot : 'div';
  return <Comp className={cn(inlineVariants({ gap, align, justify, wrap }), className)} {...props} />;
}

const containerVariants = cva('mx-auto w-full px-4 md:px-6 lg:px-8', {
  variants: {
    size: {
      prose: 'max-w-prose',
      content: 'max-w-content',
      full: '',
    },
  },
  defaultVariants: { size: 'content' },
});

interface ContainerProps extends ComponentProps<'div'>, VariantProps<typeof containerVariants> {
  asChild?: boolean;
}

/** Page gutter: 16 / 24 / 32px. Max width keeps desktop line lengths readable. */
export function Container({ size, asChild = false, className, ...props }: ContainerProps) {
  const Comp = asChild ? Slot.Slot : 'div';
  return <Comp className={cn(containerVariants({ size }), className)} {...props} />;
}

/**
 * Mobile: the primary action is pinned to the bottom of the screen, inside the thumb zone,
 * above the gesture bar. From `md` up it becomes a normal inline row where it is placed.
 * Renders a spacer so the last content on the page is never hidden behind the bar.
 */
export function StickyActionBar({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <>
      <div aria-hidden className="h-24 md:hidden" />
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-(--z-sticky) flex flex-col gap-2 border-t border-border bg-surface px-4 pt-3 pb-safe',
          'md:static md:flex-row md:justify-end md:border-0 md:bg-transparent md:p-0',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
}

/** First focusable element on every page: jumps keyboard users past navigation. */
export function SkipLink({ href = '#main', children = 'Skip to content' }: { href?: string; children?: string }) {
  return (
    <a
      href={href}
      className="sr-only rounded-control bg-surface px-4 py-3 font-semibold text-foreground shadow-md focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-(--z-tooltip)"
    >
      {children}
    </a>
  );
}
