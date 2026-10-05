import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { useSyncExternalStore } from 'react';

import { cn } from '../lib/cn';
import { TOAST_DURATION_MS } from '../tokens/motion';
import { TONE_CLASSES } from '../tokens/tones';

/*
 * Toasts confirm that something the person just did has worked ("Estimate sent").
 * They are never the only place important information appears: a toast disappears,
 * the job's status badge does not.
 */

type ToastTone = 'neutral' | 'success' | 'error' | 'info';

interface ToastOptions {
  description?: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
  title: string;
  open: boolean;
}

const TOAST_ICONS: Record<ToastTone, LucideIcon> = {
  neutral: Info,
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
};

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: ToastItem[]) {
  items = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function show(title: string, options: ToastOptions = {}) {
  const id = nextId++;
  emit([...items, { id, title, open: true, ...options }]);
  return id;
}

function close(id: number) {
  emit(items.map((item) => (item.id === id ? { ...item, open: false } : item)));
}

function remove(id: number) {
  emit(items.filter((item) => item.id !== id));
}

export const toast = {
  show,
  success: (title: string, options?: Omit<ToastOptions, 'tone'>) => show(title, { ...options, tone: 'success' }),
  error: (title: string, options?: Omit<ToastOptions, 'tone'>) => show(title, { ...options, tone: 'error' }),
  info: (title: string, options?: Omit<ToastOptions, 'tone'>) => show(title, { ...options, tone: 'info' }),
  dismiss: close,
};

/** Mount once at the app root. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, () => items, () => items);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={TOAST_DURATION_MS}>
      {toasts.map((item) => {
        const tone = item.tone ?? 'neutral';
        const IconComponent = TOAST_ICONS[tone];
        return (
          <ToastPrimitive.Root
            key={item.id}
            open={item.open}
            type={tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) close(item.id);
            }}
            onAnimationEnd={() => {
              if (!item.open) remove(item.id);
            }}
            className={cn(
              'flex w-full items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-lg',
              'data-[state=open]:animate-toast-in data-[state=closed]:animate-fade-out',
              'data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:animate-fade-out',
            )}
          >
            <IconComponent aria-hidden className={cn('size-5 shrink-0', TONE_CLASSES[tone].text)} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <ToastPrimitive.Title className="text-body font-semibold text-foreground">{item.title}</ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="text-sm text-foreground-secondary">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            {item.action ? (
              <ToastPrimitive.Action
                altText={item.action.label}
                onClick={item.action.onClick}
                className="link shrink-0 text-sm"
              >
                {item.action.label}
              </ToastPrimitive.Action>
            ) : null}
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="transition-interactive -m-1 shrink-0 rounded-sm p-1 text-foreground-muted hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      {/* Mobile: full-width above the bottom nav / action bar. Desktop: bottom-right stack. */}
      <ToastPrimitive.Viewport className="fixed inset-x-0 bottom-0 z-(--z-toast) flex flex-col gap-2 p-4 pb-safe outline-none md:right-6 md:bottom-6 md:left-auto md:w-full md:max-w-sm md:p-0" />
    </ToastPrimitive.Provider>
  );
}
