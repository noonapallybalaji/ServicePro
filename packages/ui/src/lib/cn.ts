import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know our custom scale names, otherwise it would treat `text-h1`
 * as a colour and drop it when combined with `text-foreground`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display',
        'h1',
        'h2',
        'h3',
        'body-lg',
        'body',
        'sm',
        'caption',
        'overline',
        'button',
        'button-lg',
        'stat',
        'stat-sm',
      ],
      radius: ['sm', 'md', 'lg', 'xl', 'control', 'card', 'sheet', 'pill'],
      shadow: ['xs', 'sm', 'md', 'lg'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
