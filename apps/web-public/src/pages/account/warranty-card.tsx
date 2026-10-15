import {
  getGetMyBookingQueryKey,
  getListMyBookingsQueryKey,
  isApiError,
  useGetMyBookingAvailability,
  useRequestWarrantyRevisit,
  type WarrantyCardResponse,
} from '@servicepro/api-client';
import { Alert, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Text, Textarea, formatDate } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { EMPTY_DRAFT, type Draft } from '../booking/draft';
import { TimeStep } from '../booking/time-step';

/** The job's service warranty, and "the problem came back" while it lasts. */
export function WarrantyCard({ bookingId, warranty }: { bookingId: string; warranty: WarrantyCardResponse }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden className={warranty.active ? 'size-6 shrink-0 text-success' : 'size-6 shrink-0 text-foreground-muted'} />
        <div className="flex flex-col gap-1">
          <Text weight="semibold">{warranty.active ? `Under warranty until ${formatDate(warranty.until)}` : `Warranty ended on ${formatDate(warranty.until)}`}</Text>
          <Text variant="sm" tone="secondary">
            Covers: {warranty.terms}
          </Text>
        </div>
      </div>
      {warranty.openRevisitSrNumber ? (
        <Text variant="sm">
          We're on it: re-visit <span className="tabular-nums font-semibold">{warranty.openRevisitSrNumber}</span> is in{' '}
          <Link className="link" to="/account">
            My bookings
          </Link>
          .
        </Text>
      ) : warranty.canRequestRevisit ? (
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
          <RotateCcw aria-hidden /> Problem came back?
        </Button>
      ) : null}
      {open ? <RevisitDialog bookingId={bookingId} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function RevisitDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const availability = useGetMyBookingAvailability(bookingId);
  const revisit = useRequestWarrantyRevisit({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetMyBookingQueryKey(bookingId) }),
          queryClient.invalidateQueries({ queryKey: getListMyBookingsQueryKey() }),
        ]);
        onClose();
      },
    },
  });

  function submit() {
    if (!draft.slotStart || description.trim().length < 3) return;
    revisit.mutate({ id: bookingId, data: { description: description.trim(), preferredSlotStart: draft.slotStart, preferredSlotEnd: draft.slotEnd } });
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent presentation="sheet">
        <DialogHeader title="Problem came back?" description="It's covered by your warranty: there's no visiting charge. We'll confirm the time with you." />
        <DialogBody className="flex flex-col gap-4">
          {isApiError(revisit.error) ? <Alert role="alert" tone="error" title={revisit.error.message} /> : null}
          <Field label="What's happening?">
            <Textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <TimeStep
            draft={draft}
            update={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onNext={submit}
            availability={availability.data}
            loading={availability.isPending}
            failed={availability.isError}
            actions={(ready) => (
              <DialogFooter className="px-0">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!ready || description.trim().length < 3} loading={revisit.isPending}>
                  Request re-visit
                </Button>
              </DialogFooter>
            )}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
