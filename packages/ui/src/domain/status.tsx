import { Check, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge, StatusDot, type BadgeProps } from '../components/badge';
import { cn } from '../lib/cn';
import {
  SERVICE_REQUEST_STATUS,
  TECHNICIAN_DUTY_STATUS,
  type ServiceRequestStatus,
  type StatusAudience,
  type TechnicianDutyStatus,
} from '../tokens/status';
import { TONE_CLASSES } from '../tokens/tones';

/* â”€â”€ Status badges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface StatusBadgeProps extends Pick<BadgeProps, 'size' | 'className'> {
  status: ServiceRequestStatus;
  /** Same status, different words: "En route" (staff) vs "On the way" (customer). */
  audience?: StatusAudience;
}

/** Colour is never the only signal: every status has an icon (or live dot) AND a label. */
export function StatusBadge({ status, audience = 'staff', size, className }: StatusBadgeProps) {
  const definition = SERVICE_REQUEST_STATUS[status];
  const IconComponent = definition.icon;
  return (
    <Badge tone={definition.tone} size={size} className={className}>
      {definition.live ? (
        <StatusDot colorClass={TONE_CLASSES[definition.tone].fill} live />
      ) : (
        <IconComponent aria-hidden />
      )}
      {definition.labels[audience]}
    </Badge>
  );
}

export function DutyStatusBadge({
  status,
  size,
  className,
}: { status: TechnicianDutyStatus } & Pick<BadgeProps, 'size' | 'className'>) {
  const definition = TECHNICIAN_DUTY_STATUS[status];
  return (
    <Badge tone="neutral" appearance="outline" size={size} className={cn('bg-surface', className)}>
      <StatusDot colorClass={definition.dotClass} live={status === 'ON_JOB'} />
      {definition.label}
    </Badge>
  );
}

/* â”€â”€ Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type TimelineStepState = 'complete' | 'current' | 'upcoming' | 'attention';

export interface TimelineStep {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Pre-formatted time ("10:42 AM"). Formatting is the caller's job (locale). */
  timestamp?: string;
  state: TimelineStepState;
}

const STATE_SR_TEXT: Record<TimelineStepState, string> = {
  complete: 'Completed',
  current: 'In progress',
  upcoming: 'Upcoming',
  attention: 'Needs attention',
};

interface StatusTimelineProps {
  steps: TimelineStep[];
  /** `comfortable` for the customer tracking page; `compact` for admin activity logs. */
  density?: 'comfortable' | 'compact';
  /** Override the visually hidden state names (i18n). */
  stateLabels?: Partial<Record<TimelineStepState, string>>;
  className?: string;
}

/**
 * Vertical progress. The connector below a step is coloured when that step is complete,
 * so the filled line literally shows "how far along" the job is.
 */
export function StatusTimeline({ steps, density = 'comfortable', stateLabels, className }: StatusTimelineProps) {
  const compact = density === 'compact';
  return (
    <ol className={cn('flex flex-col', className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li
            key={step.id}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="relative flex gap-3"
          >
            <div className="flex flex-col items-center">
              <TimelineMarker state={step.state} compact={compact} />
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    'w-px flex-1',
                    step.state === 'complete' ? 'bg-primary' : 'bg-border',
                    compact ? 'min-h-4' : 'min-h-6',
                  )}
                />
              ) : null}
            </div>
            <div className={cn('flex min-w-0 flex-1 flex-col gap-1', isLast ? 'pb-0' : compact ? 'pb-4' : 'pb-6')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p
                  className={cn(
                    compact ? 'text-sm' : 'text-body',
                    'font-semibold',
                    step.state === 'upcoming' ? 'text-foreground-muted' : 'text-foreground',
                  )}
                >
                  {step.title}
                  <span className="sr-only">, {stateLabels?.[step.state] ?? STATE_SR_TEXT[step.state]}</span>
                </p>
                {step.timestamp ? (
                  <p className="text-caption text-foreground-muted tabular-nums">{step.timestamp}</p>
                ) : null}
              </div>
              {step.description ? (
                <div className="text-sm text-foreground-secondary">{step.description}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TimelineMarker({ state, compact }: { state: TimelineStepState; compact: boolean }) {
  const size = compact ? 'size-5' : 'size-6';
  const iconSize = compact ? 'size-3' : 'size-4';

  switch (state) {
    case 'complete':
      return (
        <span className={cn(size, 'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground')}>
          <Check aria-hidden className={iconSize} strokeWidth={3} />
        </span>
      );
    case 'current':
      return (
        <span className={cn(size, 'flex shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface')}>
          <StatusDot colorClass="bg-primary" live />
        </span>
      );
    case 'attention':
      return (
        <span className={cn(size, 'flex shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground')}>
          <TriangleAlert aria-hidden className={iconSize} />
        </span>
      );
    case 'upcoming':
      return <span className={cn(size, 'shrink-0 rounded-full border-2 border-border bg-surface')} />;
  }
}
