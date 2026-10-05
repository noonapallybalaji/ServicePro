import { ChevronRight, ShieldCheck, Star, type LucideIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { Avatar } from '../components/avatar';
import { Badge } from '../components/badge';
import { cardVariants } from '../components/card';
import { cn } from '../lib/cn';
import { formatINR } from '../lib/format';
import { TECHNICIAN_DUTY_STATUS, type TechnicianDutyStatus } from '../tokens/status';
import { DutyStatusBadge } from './status';

/* ── ServiceCard ──────────────────────────────────────────────────────────── */

interface ServiceCardProps extends Omit<ComponentProps<'button'>, 'title'> {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Visiting charge from the price list (PLAN.md §7.5) — shown up front to build trust. */
  startingPrice?: number;
  pricePrefix?: string;
  /** `tile` for grids and horizontal carousels; `row` for lists. */
  layout?: 'tile' | 'row';
  /**
   * Render the child element (e.g. a router <Link>) as the card. Landing pages use real
   * links so service pages are crawlable.
   */
  asChild?: boolean;
}

export function ServiceCard({
  icon: IconComponent,
  title,
  description,
  startingPrice,
  pricePrefix = 'Visit from',
  layout = 'tile',
  asChild = false,
  className,
  children,
  ...props
}: ServiceCardProps) {
  const Comp = asChild ? Slot.Slot : 'button';
  const price =
    startingPrice !== undefined ? (
      <span className="text-sm text-foreground-secondary">
        {pricePrefix}{' '}
        <span className="font-semibold text-foreground tabular-nums">{formatINR(startingPrice)}</span>
      </span>
    ) : null;

  const content =
    layout === 'tile' ? (
      <>
        <span className="flex size-12 items-center justify-center rounded-control bg-primary-subtle text-primary">
          <IconComponent aria-hidden className="size-6" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-body font-semibold text-foreground">{title}</span>
          {description ? <span className="text-sm text-foreground-secondary">{description}</span> : null}
        </span>
        {price ? <span className="mt-auto">{price}</span> : null}
      </>
    ) : (
      <>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary">
          <IconComponent aria-hidden className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body font-semibold text-foreground">{title}</span>
          {description ? <span className="text-sm text-foreground-secondary">{description}</span> : null}
          {price}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground-muted" />
      </>
    );

  return (
    <Comp
      {...(asChild ? {} : { type: 'button' as const })}
      className={cn(
        cardVariants({ variant: 'interactive', padding: 'none' }),
        'flex w-full p-4',
        layout === 'tile' ? 'h-full flex-col items-start gap-3' : 'items-center gap-4',
        className,
      )}
      {...props}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
      {content}
    </Comp>
  );
}

/* ── TechnicianCard ───────────────────────────────────────────────────────── */

interface TechnicianCardProps {
  name: string;
  photoUrl?: string;
  /** "AC & refrigerator specialist" — derived from technician_skills. */
  specialty: string;
  rating?: number;
  completedJobs?: number;
  /**
   * A trust credential backed by a real business process (e.g. "ID verified").
   * Never pass a claim the business cannot stand behind — see UX-ARCHITECTURE.md §0.
   */
  credential?: string;
  /** Staff views only: live duty status. */
  dutyStatus?: TechnicianDutyStatus;
  /** Call / message buttons, or an "Assign" action in dispatch. */
  actions?: ReactNode;
  /** Extra context row (ETA, distance, match score). */
  footer?: ReactNode;
  className?: string;
}

export function TechnicianCard({
  name,
  photoUrl,
  specialty,
  rating,
  completedJobs,
  credential,
  dutyStatus,
  actions,
  footer,
  className,
}: TechnicianCardProps) {
  return (
    <div className={cn(cardVariants({ variant: 'outline', padding: 'md' }), 'flex flex-col gap-4', className)}>
      <div className="flex items-start gap-4">
        <Avatar
          name={name}
          src={photoUrl}
          size="lg"
          statusClass={dutyStatus ? TECHNICIAN_DUTY_STATUS[dutyStatus].dotClass : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-h3 text-foreground">{name}</p>
            {credential ? (
              <Badge tone="primary" size="sm">
                <ShieldCheck aria-hidden />
                {credential}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-foreground-secondary">{specialty}</p>
          {rating !== undefined || completedJobs !== undefined ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-secondary">
              {rating !== undefined ? (
                <span className="inline-flex items-center gap-1">
                  <Star aria-hidden className="size-4 fill-rating text-rating" />
                  <span className="font-semibold text-foreground tabular-nums">{rating.toFixed(1)}</span>
                  <span className="sr-only">out of 5 rating</span>
                </span>
              ) : null}
              {completedJobs !== undefined ? (
                <span className="tabular-nums">{completedJobs.toLocaleString('en-IN')} jobs completed</span>
              ) : null}
            </p>
          ) : null}
        </div>
        {dutyStatus ? <DutyStatusBadge status={dutyStatus} size="sm" className="max-sm:hidden" /> : null}
      </div>
      {footer ? <div className="border-t border-border pt-4">{footer}</div> : null}
      {actions ? <div className="flex gap-3 *:flex-1">{actions}</div> : null}
    </div>
  );
}
