import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useListServiceRequests, type ServiceRequestCard } from '@servicepro/api-client';
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  EmptyState,
  Heading,
  PageHeader,
  StatusBadge,
  Text,
  cn,
  formatRelative,
  formatWindow,
  useMediaQuery,
  MEDIA_QUERIES,
} from '@servicepro/ui';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';
import { AssignmentPanel } from './assignment-panel';

/**
 * The assignment queue (UX-ARCHITECTURE.md §3.3): unassigned and unanswered jobs on the left,
 * ranked technicians for the selected job on the right. On phones the ranking opens full-screen.
 */
export function DispatchPage() {
  const queue = useListServiceRequests({ status: ['READY_FOR_ASSIGNMENT', 'OFFERED', 'RESCHEDULED'], pageSize: 100 });
  const toReview = useListServiceRequests({ status: ['NEW'], pageSize: 1 });
  const reviewCount = toReview.data?.total ?? 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDesktop = useMediaQuery(MEDIA_QUERIES.lg);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dispatch" description="Pick a job, then the best technician for it." />
      {reviewCount > 0 ? (
        <Alert
          tone="info"
          title={reviewCount === 1 ? '1 new booking to check before dispatch' : `${reviewCount} new bookings to check before dispatch`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={`${paths.requests}?view=review`}>Review</Link>
            </Button>
          }
        />
      ) : null}
      <QueryState query={queue} loading={<DefaultSkeleton rows={4} />} errorTitle="Couldn't load the queue">
        {(data) => {
          const selected = data.items.find((r) => r.id === selectedId) ?? (isDesktop ? data.items[0] : undefined);
          return data.items.length === 0 ? (
            <Card>
              <EmptyState icon={CircleCheck} title="Everything is assigned" description="New requests appear here until someone accepts them." />
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <section aria-labelledby="queue" className="flex flex-col gap-3 lg:col-span-2">
                <Heading level={2} size="h3" id="queue">
                  Queue · {data.total}
                </Heading>
                <ul className="flex flex-col gap-2">
                  {data.items.map((request) => (
                    <li key={request.id}>
                      <QueueItem request={request} selected={selected?.id === request.id} onSelect={() => setSelectedId(request.id)} />
                    </li>
                  ))}
                </ul>
              </section>

              {isDesktop && selected ? (
                <section aria-labelledby="candidates" className="flex flex-col gap-3 lg:col-span-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Heading level={2} size="h3" id="candidates">
                      Best matches for {selected.srNumber}
                    </Heading>
                    <Link to={paths.request(selected.id)} className="link text-sm">
                      Open request
                    </Link>
                  </div>
                  <AssignmentPanel key={selected.id} serviceRequestId={selected.id} onAssigned={() => setSelectedId(null)} />
                </section>
              ) : null}

              {!isDesktop ? (
                <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
                  <DialogContent presentation="drawer">
                    <DialogHeader title={`Assign ${selected?.srNumber ?? ''}`} description={selected ? `${selected.categoryName} · ${selected.locality}` : undefined} />
                    <DialogBody className="py-4">
                      {selectedId ? <AssignmentPanel serviceRequestId={selectedId} onAssigned={() => setSelectedId(null)} /> : null}
                    </DialogBody>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}

function QueueItem({ request, selected, onSelect }: { request: ServiceRequestCard; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'pressable transition-interactive flex w-full flex-col gap-1 rounded-card border bg-surface p-3 text-left',
        selected ? 'border-primary bg-primary-subtle' : 'border-border hover:border-border-strong',
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{request.srNumber}</span>
        <StatusBadge status={request.status} size="sm" />
      </span>
      <span className="text-sm text-foreground">
        {request.categoryName} · {request.locality || request.pincode}
      </span>
      <Text variant="caption" tone="muted">
        {request.scheduledStart ? `Visit ${formatWindow(request.scheduledStart, request.scheduledEnd)} · ` : ''}
        waiting {formatRelative(request.lastStatusChangeAt).replace(' ago', '')}
      </Text>
    </button>
  );
}
