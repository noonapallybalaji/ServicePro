import { cn } from '@servicepro/ui';

import { SITE } from '../site';

/**
 * The Pakka Fix wordmark. "dark" (navy and orange) for light surfaces, "light" (white and orange)
 * for dark ones. The name is the image's alt text, so the link around it reads as the brand.
 */
export function SiteLogo({ variant = 'dark', className }: { variant?: 'dark' | 'light'; className?: string }) {
  return (
    <img
      src={variant === 'dark' ? '/brand/logo.png' : '/brand/logo-light.png'}
      alt={SITE.name}
      width={669}
      height={120}
      decoding="async"
      className={cn('h-7 w-auto shrink-0 sm:h-8', className)}
    />
  );
}
