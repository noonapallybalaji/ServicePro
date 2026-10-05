import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { BrandLockup } from '../illustrations/scenes';

interface AuthLayoutProps {
  /** Large line on the brand panel, e.g. "Every job, in your pocket". */
  pitch: string;
  /** Up to three short, true statements about the product. */
  highlights?: { icon: LucideIcon; text: string }[];
  art: ReactNode;
  tagline?: string;
  children: ReactNode;
}

/**
 * Sign-in screens: a colourful brand panel beside the form on desktop; on phones the panel
 * shrinks to a short band above the form so the input is still in the first screen.
 */
export function AuthLayout({ pitch, highlights = [], art, tagline, children }: AuthLayoutProps) {
  return (
    <main id="main" className="grid min-h-dvh bg-background lg:grid-cols-2">
      <section data-surface="brand" className="surface-hero relative isolate flex flex-col overflow-hidden px-6 pt-8 pb-10 lg:p-12">
        <div aria-hidden className="bg-dots absolute inset-0 -z-10" />
        <BrandLockup tagline={tagline} />
        <div className="flex flex-1 flex-col justify-center gap-8 pt-6 lg:pt-0">
          <p className="text-h1 text-balance max-lg:text-h2">{pitch}</p>
          <div className="hidden max-w-dialog lg:block [&>svg]:h-auto [&>svg]:w-full">{art}</div>
          {highlights.length > 0 ? (
            <ul className="hidden flex-col gap-3 lg:flex">
              {highlights.map(({ icon: IconComponent, text }) => (
                <li key={text} className="flex items-center gap-3 text-body text-foreground-secondary">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-nav-active text-accent">
                    <IconComponent aria-hidden className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <section className="flex items-start justify-center px-4 py-8 lg:items-center lg:py-12">
        <div className="-mt-12 flex w-full max-w-sm flex-col gap-6 lg:mt-0">{children}</div>
      </section>
    </main>
  );
}
