import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/*
 * Semantics (h1–h6) and appearance (display/h1/h2/h3) are separate decisions:
 * a card title is often an <h3> that looks like `h3`, while a page title on mobile
 * is an <h1> that may look like `h2`. Never skip heading levels for looks.
 */

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type HeadingSize = 'display' | 'h1' | 'h2' | 'h3';

const DEFAULT_SIZE_FOR_LEVEL: Record<HeadingLevel, HeadingSize> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h3',
  5: 'h3',
  6: 'h3',
};

const HEADING_SIZE_CLASSES: Record<HeadingSize, string> = {
  display: 'text-display',
  h1: 'text-h1',
  h2: 'text-h2',
  h3: 'text-h3',
};

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
  size?: HeadingSize;
}

export function Heading({ level = 2, size, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={cn(
        HEADING_SIZE_CLASSES[size ?? DEFAULT_SIZE_FOR_LEVEL[level]],
        'text-balance text-foreground',
        className,
      )}
      {...props}
    />
  );
}

const textVariants = cva('', {
  variants: {
    variant: {
      'body-lg': 'text-body-lg',
      body: 'text-body',
      sm: 'text-sm',
      caption: 'text-caption',
      overline: 'text-overline uppercase',
      /** KPIs, prices, ETAs, OTPs: tabular figures so digits don't jitter as they update. */
      stat: 'text-stat tabular-nums',
      'stat-sm': 'text-stat-sm tabular-nums',
    },
    tone: {
      default: 'text-foreground',
      secondary: 'text-foreground-secondary',
      muted: 'text-foreground-muted',
      inverse: 'text-foreground-inverse',
      brand: 'text-primary',
      success: 'text-success-subtle-foreground',
      warning: 'text-warning-subtle-foreground',
      error: 'text-error',
    },
    weight: {
      regular: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    variant: 'body',
    tone: 'default',
  },
});

type TextElement = 'p' | 'span' | 'div' | 'strong' | 'small' | 'dt' | 'dd' | 'li' | 'figcaption';

interface TextProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof textVariants> {
  as?: TextElement;
}

export function Text({ as: Tag = 'p', variant, tone, weight, className, ...props }: TextProps) {
  return <Tag className={cn(textVariants({ variant, tone, weight }), className)} {...props} />;
}
