import { cn } from '@servicepro/ui';
import { Bot, MessageCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { SITE, whatsappLink } from '../site';
import { isBarHidden, useTyping } from './mobile-action-bar';

/** The AI assistant answers on WhatsApp only once the business says it is live (VITE_WHATSAPP_ASSISTANT=true). */
const ASSISTANT_LIVE = import.meta.env.VITE_WHATSAPP_ASSISTANT === 'true';

const PROMPTS = ['I need an appliance repaired', 'Where is my technician?', 'How much does a repair cost?', 'The problem came back after a repair'];

/**
 * The floating assistant: a button in the corner that opens a small chat panel. The conversation
 * itself happens on WhatsApp (where the assistant runs), so each quick question opens the chat with
 * it already typed. Stays out of the way of the bottom bar, the keyboard and the booking steps.
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

  if (!SITE.phone || isBarHidden(pathname)) return null;
  const title = ASSISTANT_LIVE ? 'AI assistant' : 'Need help?';

  return (
    <div
      ref={root}
      className={cn(
        'fixed right-4 z-(--z-sticky) flex flex-col items-end gap-3',
        'bottom-[calc(4.5rem+env(safe-area-inset-bottom)+1rem)] lg:right-6 lg:bottom-6',
        typing && 'hidden',
      )}
    >
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          // Never taller than the space between the header and the button: scrolls inside on short screens.
          className={cn(
            'flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-3 shadow-lg',
            'max-h-[calc(100dvh-var(--header-height)-env(safe-area-inset-bottom)-11rem)] lg:max-h-[calc(100dvh-var(--header-height)-7rem)]',
          )}
        >
          <div className="flex items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground [&_svg]:size-4">
              <Bot aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <span className="text-caption text-foreground-secondary">
                {ASSISTANT_LIVE ? 'Replies on WhatsApp, and hands over to our team when needed.' : `Chat with ${SITE.name} on WhatsApp.`}
              </span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="transition-interactive -mt-1 -mr-1 rounded-control p-1 text-foreground-muted hover:text-foreground">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="rounded-card rounded-tl-none bg-surface-sunken px-3 py-2 text-caption text-foreground">
            Hi! I can help you book a repair, check on a booking or answer a question. What do you need?
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Quick questions">
            {PROMPTS.map((prompt) => (
              <li key={prompt}>
                <a
                  href={whatsappLink(prompt)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                  className="transition-interactive inline-flex min-h-8 items-center rounded-pill border border-primary-border bg-primary-subtle px-3 text-caption font-semibold text-primary-subtle-foreground hover:border-primary"
                >
                  {prompt}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={whatsappLink('Hi, I have a question.')}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="pressable transition-interactive flex h-10 shrink-0 items-center justify-center gap-2 rounded-control bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover [&_svg]:size-4"
          >
            <MessageCircle aria-hidden /> Chat on WhatsApp
          </a>
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
