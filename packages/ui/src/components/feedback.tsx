import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { TONE_CLASSES, TONE_SURFACE_CLASSES } from '../tokens/tones';
import { Button } from './button';

/* ── Alert ────────────────────────────────────────────────────────────────── */

export type AlertTone = 'info' | 'success' | 'warning' | 'error' | 'neutral';

const ALERT_ICONS: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  neutral: Info,
};

interface AlertProps extends Omit<ComponentProps<'div'>, 'title'> {
  tone?: AlertTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}

/**
 * Inline, persistent message tied to a region of the page. For messages that appear
 * after an action, pass role="alert" (errors) or role="status" (everything else).
 */
export function Alert({ tone = 'info', title, description, action, icon, className, ...props }: AlertProps) {
  const IconComponent = icon ?? ALERT_ICONS[tone];
  return (
    <div
      className={cn('flex gap-3 rounded-card border p-4', TONE_SURFACE_CLASSES[tone], className)}
      {...props}
    >
      <IconComponent aria-hidden className={cn('size-5 shrink-0', TONE_CLASSES[tone].text)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body font-semibold text-foreground">{title}</p>
        {description ? <div className="text-sm text-foreground-secondary">{description}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

/* ── Loading ──────────────────────────────────────────────────────────────── */

const SPINNER_SIZE = { sm: 'size-4', md: 'size-5', lg: 'size-8' } as const;

export function Spinner({ size = 'md', className }: { size?: keyof typeof SPINNER_SIZE; className?: string }) {
  return <LoaderCircle aria-hidden className={cn('animate-spin text-primary', SPINNER_SIZE[size], className)} />;
}

/** Use for short waits where the shape of the result is unknown. Prefer Skeleton otherwise. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}
    >
      <Spinner size="lg" />
      <p className="text-sm text-foreground-secondary">{label}</p>
    </div>
  );
}

/** Placeholder that mirrors the shape of the content being loaded. Decorative. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} />;
}

/* ── Empty & error ────────────────────────────────────────────────────────── */

interface StateProps {
  icon: LucideIcon;
  /** Spot illustration shown instead of the icon (e.g. <SpotArt kind="inbox" />). */
  illustration?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** `compact` inside cards and table bodies; `page` for whole views. */
  size?: 'compact' | 'page';
  className?: string;
}

/**
 * Every empty state answers: why is this empty, and what can I do about it?
 * ("No jobs yet today — new offers appear here automatically.")
 */
export function EmptyState({ icon: IconComponent, illustration, title, description, action, size = 'page', className }: StateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        size === 'page' ? 'gap-4 py-16' : 'gap-3 py-8',
        className,
      )}
    >
      {illustration ? (
        <span className={cn('flex [&>svg]:size-full', size === 'page' ? 'size-32' : 'size-24')}>{illustration}</span>
      ) : (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-sunken text-foreground-secondary',
            size === 'page' ? 'size-14' : 'size-10',
          )}
        >
          <IconComponent aria-hidden className={size === 'page' ? 'size-6' : 'size-5'} />
        </span>
      )}
      <div className="flex max-w-prose flex-col gap-1">
        <p className={cn('font-semibold text-foreground', size === 'page' ? 'text-h3' : 'text-body')}>{title}</p>
        {description ? <p className="text-sm text-foreground-secondary">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps extends Omit<StateProps, 'icon' | 'action' | 'illustration'> {
  icon?: LucideIcon;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra action such as "Call support". */
  secondaryAction?: ReactNode;
}

/**
 * Say what happened in plain words, reassure about data ("your request is saved"),
 * and give one way forward. Never show raw error codes to customers or technicians.
 */
export function ErrorState({
  icon = TriangleAlert,
  title,
  description,
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
  size = 'page',
  className,
}: ErrorStateProps) {
  const IconComponent = icon;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center text-center',
        size === 'page' ? 'gap-4 py-16' : 'gap-3 py-8',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-error-subtle text-error',
          size === 'page' ? 'size-14' : 'size-10',
        )}
      >
        <IconComponent aria-hidden className={size === 'page' ? 'size-6' : 'size-5'} />
      </span>
      <div className="flex max-w-prose flex-col gap-1">
        <p className={cn('font-semibold text-foreground', size === 'page' ? 'text-h3' : 'text-body')}>{title}</p>
        {description ? <p className="text-sm text-foreground-secondary">{description}</p> : null}
      </div>
      {onRetry || secondaryAction ? (
        <div className="flex flex-wrap justify-center gap-3">
          {onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/* ── Step progress ────────────────────────────────────────────────────────── */

interface StepProgressProps {
  current: number;
  total: number;
  /** Name of the current step: "Describe the problem". */
  label: string;
  /** Formats the counter; injectable for i18n. */
  formatCounter?: (current: number, total: number) => string;
  className?: string;
}

/** Full-screen mobile flows (booking, estimate builder) show where you are and how much is left. */
export function StepProgress({
  current,
  total,
  label,
  formatCounter = (c, t) => `Step ${c} of ${t}`,
  className,
}: StepProgressProps) {
  const counter = formatCounter(current, total);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-caption text-foreground-muted tabular-nums">{counter}</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${counter}: ${label}`}
        className="flex gap-1"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              'transition-interactive h-1 flex-1 rounded-pill',
              index < current ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </div>
    </div>
  );
}
