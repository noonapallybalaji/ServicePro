import { cva } from 'class-variance-authority';
import { ArrowLeft, X } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Button } from './button';
import { IconButton } from './icon-button';

/*
 * ONE overlay primitive, three presentations. The switch between mobile and desktop
 * forms is pure CSS — no JS media queries, no duplicate components.
 *
 *  presentation   < md (phone)                     ≥ md (tablet/desktop)
 *  ───────────────────────────────────────────────────────────────────────────
 *  "dialog"       bottom sheet                     centred modal
 *  "sheet"        bottom sheet                     bottom sheet, width-capped
 *  "drawer"       full-screen page (back arrow)    right-side panel
 */
export type DialogPresentation = 'dialog' | 'sheet' | 'drawer';

const PresentationContext = createContext<DialogPresentation>('dialog');

const overlayClasses =
  'fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out';

const contentVariants = cva(
  'fixed z-(--z-overlay) flex flex-col bg-surface text-foreground shadow-lg outline-none focus-visible:outline-none',
  {
    variants: {
      presentation: {
        dialog: [
          'inset-x-0 bottom-0 max-h-(--sheet-max-height) rounded-t-sheet pb-safe',
          'data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out',
          'md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-dialog md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet md:pb-0',
          'md:data-[state=open]:animate-dialog-in md:data-[state=closed]:animate-dialog-out',
        ],
        sheet: [
          'inset-x-0 bottom-0 mx-auto max-h-(--sheet-max-height) w-full max-w-sheet rounded-t-sheet pb-safe',
          'data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out',
        ],
        drawer: [
          'inset-0 pt-safe',
          'data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out',
          'md:left-auto md:w-full md:max-w-drawer md:border-l md:border-border md:pt-0',
        ],
      },
    },
    defaultVariants: { presentation: 'dialog' },
  },
);

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  presentation?: DialogPresentation;
}

export function DialogContent({ presentation = 'dialog', className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn(overlayClasses, presentation === 'drawer' && 'max-md:hidden')} />
      <DialogPrimitive.Content className={cn(contentVariants({ presentation }), className)} {...props}>
        <PresentationContext value={presentation}>{children}</PresentationContext>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface DialogHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Extra controls next to the close button (e.g. a status badge in an SR drawer). */
  actions?: ReactNode;
  hideClose?: boolean;
  closeLabel?: string;
  className?: string;
}

/**
 * The close affordance adapts to the presentation: a full-screen mobile drawer behaves
 * like a page, so it gets a back arrow on the left; everything else gets an × on the right.
 */
export function DialogHeader({
  title,
  description,
  actions,
  hideClose = false,
  closeLabel = 'Close',
  className,
}: DialogHeaderProps) {
  const presentation = useContext(PresentationContext);
  const isDrawer = presentation === 'drawer';

  return (
    <div
      className={cn(
        'flex shrink-0 items-start gap-3 px-5 pt-5 pb-3',
        isDrawer && 'border-b border-border pb-4 max-md:items-center max-md:px-2 max-md:pt-2 max-md:pb-2',
        className,
      )}
    >
      {isDrawer && !hideClose ? (
        <DialogPrimitive.Close asChild>
          <IconButton icon={ArrowLeft} label={closeLabel} className="md:hidden" />
        </DialogPrimitive.Close>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DialogPrimitive.Title className="text-h3 text-foreground">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-sm text-foreground-secondary">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      {actions}
      {!hideClose ? (
        <DialogPrimitive.Close asChild>
          <IconButton
            icon={X}
            label={closeLabel}
            size="sm"
            className={cn('-mt-1 -mr-2', isDrawer && 'max-md:hidden')}
          />
        </DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-2', className)} {...props} />;
}

/** Mobile: full-width stacked buttons, primary on top. Desktop: right-aligned row. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-3 px-5 pt-3 pb-5 *:w-full md:flex-row md:justify-end md:*:w-auto',
        className,
      )}
      {...props}
    />
  );
}

/* ── Confirmation ─────────────────────────────────────────────────────────── */

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `destructive` for irreversible actions (cancel a job, reject a lead). */
  tone?: 'default' | 'destructive';
  /** May return a promise; the confirm button shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Uses role="alertdialog": it cannot be dismissed by clicking outside, so an
 * irreversible action always needs an explicit choice.
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
}: ConfirmationDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlayClasses} />
        <AlertDialogPrimitive.Content className={contentVariants({ presentation: 'dialog' })}>
          <div className="flex flex-col gap-2 px-5 pt-6 pb-2">
            <AlertDialogPrimitive.Title className="text-h3 text-foreground">{title}</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-body text-foreground-secondary">
              {description}
            </AlertDialogPrimitive.Description>
          </div>
          <DialogFooter className="pt-4">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              variant={tone === 'destructive' ? 'destructive' : 'primary'}
              loading={pending}
              onClick={() => void handleConfirm()}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
