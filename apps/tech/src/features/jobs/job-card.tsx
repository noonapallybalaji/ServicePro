import type { ServiceRequestCard } from '@servicepro/api-client';
import { CATEGORY_ICONS, StatusBadge, cardVariants, cn, formatWindow, type CategoryCode } from '@servicepro/ui';
import { ChevronRight, MapPin, Wrench } from 'lucide-react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';

/** One job in a list: what, where, when, status. The whole card is the link. */
export function JobCard({ job, emphasis = false }: { job: ServiceRequestCard; emphasis?: boolean }) {
  const Icon = CATEGORY_ICONS[job.categoryCode as CategoryCode] ?? Wrench;
  return (
    <Link
      to={paths.job(job.id)}
      className={cn(
        cardVariants({ variant: 'interactive', padding: 'md' }),
        'flex items-center gap-4',
        emphasis && 'border-primary-border bg-primary-subtle',
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-surface text-primary">
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold text-foreground">{job.categoryName}</span>
          <StatusBadge status={job.status} audience="technician" size="sm" />
        </span>
        <span className="truncate text-sm text-foreground-secondary">{job.problemSummary}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-foreground-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3" />
            {job.locality || job.pincode}
          </span>
          {job.scheduledStart ? <span className="tabular-nums">{formatWindow(job.scheduledStart, job.scheduledEnd)}</span> : null}
          <span className="tabular-nums">{job.srNumber}</span>
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground-muted" />
    </Link>
  );
}
