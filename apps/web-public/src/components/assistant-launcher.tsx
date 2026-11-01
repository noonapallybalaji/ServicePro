import { cn } from '@servicepro/ui';
import { Bot, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { SITE } from '../site';
import { HelpChat } from './help-chat';
import { isBarHidden, useTyping } from './mobile-action-bar';

/**
 * The floating help button: opens a small chat that answers common questions, checks areas and
 * starts bookings on the spot, and hands anything else to our team on WhatsApp. Stays out of the
 * way of the bottom bar, the keyboard and the booking steps.
 */
export function AssistantLauncher() {
  const { pathname } = useLocation();
  const typing = useTyping();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  // Close on Escape or a tap outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onPointer = (event: PointerEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (isBarHidden(pathname)) return null;
  const title = 'Need help?';

  return (
    <div
      ref={root}
      className={cn(
        'fixed right-4 z-(--z-sticky) flex flex-col items-end gap-3',
        // Above the bottom bar; while typing in the chat the bar steps aside, so the chat sits lower.
        typing && open ? 'bottom-4' : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom)+1rem)]',
        'lg:right-6 lg:bottom-6',
        // Typing elsewhere (a form): the closed button steps aside for the keyboard.
        typing && !open && 'hidden',
      )}
    >
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          // A fixed chat height, never taller than the space between the header and the button.
          className={cn(
            'flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-lg',
            'h-[min(34rem,calc(100dvh-var(--header-height)-env(safe-area-inset-bottom)-11rem))] lg:h-[min(36rem,calc(100dvh-var(--header-height)-7rem))]',
          )}
        >
          <div className="flex items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground [&_svg]:size-4">
              <Bot aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-foreground">{SITE.name} help</span>
              <span className="text-caption text-foreground-secondary">Instant answers, or chat with our team.</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="transition-interactive -mt-1 -mr-1 rounded-control p-1 text-foreground-muted hover:text-foreground">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <HelpChat onLeave={() => setOpen(false)} />
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? `Close ${title.toLowerCase()}` : title}
        onClick={() => setOpen((v) => !v)}
        className="pressable transition-interactive flex h-12 items-center gap-2 rounded-pill bg-primary px-4 text-primary-foreground shadow-lg hover:bg-primary-hover [&_svg]:size-5"
      >
        {open ? <X aria-hidden /> : <Bot aria-hidden />}
        <span className="text-sm font-semibold max-sm:sr-only">{open ? 'Close' : title}</span>
      </button>
    </div>
  );
}
