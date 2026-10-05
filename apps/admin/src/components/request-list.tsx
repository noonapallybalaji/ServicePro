import type { ServiceRequestCard } from '@servicepro/api-client';
import {
  Badge,
  CATEGORY_ICONS,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  cardVariants,
  cn,
  formatRelative,
  formatWindow,
  type CategoryCode,
} from '@servicepro/ui';
import { ChevronRight, Clock, Wrench } from 'lucide-react';
import { Link } from 'react-router';

import { paths } from '../app/paths';

/**
 * Service requests as cards on phones and a table from `md` up (RESPONSIVE-STRATEGY.md §3:
 * "collection of records"). One data model, two compositions — no separate components.
 */
export function RequestList({ requests, showCustomer = true }: { requests: readonly ServiceRequestCard[]; showCustomer?: boolean }) {
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {requests.map((request) => (
          <li key={request.id}>
            <RequestCardLink request={request} showCustomer={showCustomer} />
          </li>
        ))}
      </ul>

      <div className="hidden rounded-card border border-border bg-surface md:block">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Request</TableHeaderCell>
              {showCustomer ? <TableHeaderCell>Customer</TableHeaderCell> : null}
              <TableHeaderCell>Appliance</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Technician</TableHeaderCell>
              <TableHeaderCell>Visit</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-semibold whitespace-nowrap">
                  <Link to={paths.request(request.id)} className="link">
                    {request.srNumber}
                  </Link>
                  {request.priority === 'HIGH' || request.priority === 'EMERGENCY' ? (
                    <Badge tone="error" size="sm" className="ml-2">
                      {request.priority === 'EMERGENCY' ? 'Emergency' : 'Urgent'}
                    </Badge>
                  ) : null}
                </TableCell>
                {showCustomer ? (
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{request.customerName}</span>
                      <span className="text-caption text-foreground-muted">{request.locality || request.pincode}</span>
                    </div>
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="flex max-w-xs flex-col">
                    <span className="font-medium">{request.categoryName}</span>
                    <span className="truncate text-caption text-foreground-muted">{request.problemSummary}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={request.status} size="sm" />
                    {request.isStuck ? <StuckBadge /> : null}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{request.technicianName ?? <span className="text-foreground-muted">—</span>}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {request.scheduledStart ? formatWindow(request.scheduledStart, request.scheduledEnd) : <span className="text-foreground-muted">Not set</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-foreground-secondary">{formatRelative(request.lastStatusChangeAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function RequestCardLink({ request, showCustomer = true, compact = false }: { request: ServiceRequestCard; showCustomer?: boolean; compact?: boolean }) {
  const Icon = CATEGORY_ICONS[request.categoryCode as CategoryCode] ?? Wrench;
  return (
    <Link
      to={paths.request(request.id)}
      className={cn(cardVariants({ variant: 'interactive', padding: compact ? 'sm' : 'md' }), 'flex items-start gap-3')}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground tabular-nums">{request.srNumber}</span>
          {compact ? null : <StatusBadge status={request.status} size="sm" />}
          {request.isStuck ? <StuckBadge /> : null}
        </span>
        <span className="truncate text-sm text-foreground">
          {showCustomer ? `${request.customerName} · ` : ''}
          {request.categoryName}
        </span>
        <span className="truncate text-caption text-foreground-muted">
          {request.locality || request.pincode}
          {request.technicianName ? ` · ${request.technicianName}` : ''}
          {` · ${formatRelative(request.lastStatusChangeAt)}`}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-muted" />
    </Link>
  );
}

export function StuckBadge() {
  return (
    <Badge tone="warning" size="sm">
      <Clock aria-hidden />
      Stuck
    </Badge>
  );
}
