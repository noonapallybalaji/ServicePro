import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { getListMyJobsQueryKey, getListMyOffersQueryKey, useAcceptOffer, useDeclineOffer, useListMyOffers, type OfferResponse } from '@servicepro/api-client';
import {
  Badge,
  Button,
  CATEGORY_ICONS,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  EmptyState,
  Heading,
  Stack,
  Text,
  cn,
  formatCountdown,
  formatWindow,
  toast,
  useNow,
  type CategoryCode,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, MapPin, Navigation, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { paths } from '../../app/paths';

const DECLINE_REASONS = ['Too far away', 'Already busy', "Don't have the skill or tools", 'Personal reason'] as const;

/** Pending offers with a live countdown (USER-FLOWS.md §2.2 step 3). Accept is one tap. */
export function OffersPage() {
  const offers = useListMyOffers({ query: { refetchInterval: 30_000 } });

  return (
    <Stack gap={6}>
      <Heading level={1} size="h2">
        Job offers
      </Heading>
      <QueryState query={offers} loading={<DefaultSkeleton rows={2} />} errorTitle="Couldn't load your offers">
        {(data) =>
          data.length === 0 ? (
            <Card>
              <EmptyState
                icon={Inbox}
                title="No offers right now"
                description="When the office offers you a job it shows up here, with a few minutes to accept."
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-4">
              {data.map((offer) => (
                <li key={offer.assignmentId}>
                  <OfferCard offer={offer} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Stack>
  );
}

function OfferCard({ offer }: { offer: OfferResponse }) {
  const now = useNow(1000);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListMyOffersQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListMyJobsQueryKey() }),
    ]);

  const accept = useAcceptOffer({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Job accepted', { description: `${offer.srNumber} is now in your jobs.` });
        void navigate(paths.job(offer.serviceRequestId));
      },
    },
  });
  const decline = useDeclineOffer({
    mutation: {
      onSuccess: async () => {
        setDeclining(false);
        await refresh();
        toast.show('Offer declined', { description: 'The office will offer it to someone else.' });
      },
    },
  });

  const totalMs = new Date(offer.expiresAt).getTime() - new Date(offer.offeredAt).getTime();
  const remainingMs = new Date(offer.expiresAt).getTime() - now.getTime();
  const expired = remainingMs <= 0;
  const urgent = remainingMs < 60_000;
  const Icon = CATEGORY_ICONS[offer.categoryCode as CategoryCode] ?? Wrench;

  return (
    <Card variant="elevated" className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary">
          <Icon aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text weight="semibold">{offer.categoryName}</Text>
            {offer.priority === 'HIGH' || offer.priority === 'EMERGENCY' ? (
              <Badge tone="error" size="sm">
                {offer.priority === 'EMERGENCY' ? 'Emergency' : 'Urgent'}
              </Badge>
            ) : null}
          </div>
          <Text variant="sm" tone="secondary" className="flex flex-wrap items-center gap-x-3">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {offer.locality || offer.pincode}
            </span>
            {offer.distanceKm != null ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Navigation aria-hidden className="size-4" />
                {offer.distanceKm} km
              </span>
            ) : null}
          </Text>
          <Text variant="caption" tone="muted" className="tabular-nums">
            {offer.srNumber}
            {offer.scheduledStart ? ` · ${formatWindow(offer.scheduledStart, null)}` : ''}
          </Text>
        </div>
        <div className="flex flex-col items-end" aria-live="off">
          <Text variant="stat-sm" tone={urgent ? 'error' : 'default'}>
            {expired ? '0:00' : formatCountdown(remainingMs)}
          </Text>
          <Text variant="caption" tone="muted">
            to accept
          </Text>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Time left to accept"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.max(0, Math.round((remainingMs / totalMs) * 100))}
        className="h-1 overflow-hidden rounded-pill bg-surface-sunken"
      >
        <span
          className={cn('block h-full rounded-pill transition-interactive', urgent ? 'bg-error' : 'bg-primary')}
          // Countdown width is time-driven; it can't be a static utility class.
          // eslint-disable-next-line no-restricted-syntax -- data-driven width
          style={{ width: `${Math.max(0, Math.min(100, (remainingMs / totalMs) * 100))}%` }}
        />
      </div>

      <div className="flex gap-3 *:flex-1">
        <Button variant="outline" disabled={expired || accept.isPending} onClick={() => setDeclining(true)}>
          Decline
        </Button>
        <Button size="lg" loading={accept.isPending} disabled={expired} onClick={() => accept.mutate({ assignmentId: offer.assignmentId })}>
          {expired ? 'Expired' : 'Accept job'}
        </Button>
      </div>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent presentation="sheet">
          <DialogHeader title="Why are you declining?" description="This helps the office offer better jobs." />
          <DialogBody className="flex flex-col gap-2 pb-4">
            {DECLINE_REASONS.map((reason) => (
              <Button
                key={reason}
                variant="secondary"
                size="lg"
                fullWidth
                className="justify-start"
                loading={decline.isPending && decline.variables?.data.reason === reason}
                onClick={() => decline.mutate({ assignmentId: offer.assignmentId, data: { reason } })}
              >
                {reason}
              </Button>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
