import { getListMyBookingsQueryKey, isApiError, useCancelMyBooking, useRescheduleMyBooking, type MyBookingResponse } from '@servicepro/api-client';
import { Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Textarea } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, LifeBuoy, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { EMPTY_DRAFT, type Draft } from '../booking/draft';
import { slotWindow } from '../booking/slots';
import { TimeStep } from '../booking/time-step';

/**
 * Cancel or move a booking (allowed until the technician sets out; the API has the final word,
 * and its settings decide whether these buttons appear at all).
 */
export function BookingChanges({ booking }: { booking: MyBookingResponse }) {
  const [open, setOpen] = useState<'cancel' | 'reschedule' | null>(null);

  return (
    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
      {booking.canReschedule ? (
        <Button size="sm" variant="outline" onClick={() => setOpen('reschedule')}>
          <CalendarClock aria-hidden /> Change time
        </Button>
      ) : null}
      {booking.canCancel ? (
        <Button size="sm" variant="ghost" className="text-error" onClick={() => setOpen('cancel')}>
          <X aria-hidden /> Cancel booking
        </Button>
      ) : null}
      <Button asChild size="sm" variant="ghost">
        <Link to={`/account?tab=help&booking=${booking.id}`}>
          <LifeBuoy aria-hidden /> Get help
        </Link>
      </Button>
      {open === 'reschedule' ? <RescheduleDialog booking={booking} onClose={() => setOpen(null)} /> : null}
      {open === 'cancel' ? <CancelDialog booking={booking} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function useRefreshBookings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getListMyBookingsQueryKey() });
}

function RescheduleDialog({ booking, onClose }: { booking: MyBookingResponse; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const refresh = useRefreshBookings();
  const reschedule = useRescheduleMyBooking({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await refresh();
        onClose();
      },
    },
  });

  function submit() {
    if (!draft.date || !draft.slot) return;
    const window = slotWindow(draft.date, draft.slot);
    reschedule.mutate({ id: booking.id, data: { preferredSlotStart: window.start, preferredSlotEnd: window.end } });
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent presentation="sheet">
        <DialogHeader
          title={`Change the time for ${booking.srNumber}`}
          description={booking.technicianName ? `We'll confirm the new time with you and ${booking.technicianName}.` : "We'll confirm the new time with you on WhatsApp."}
        />
        <DialogBody className="flex flex-col gap-4">
          {isApiError(reschedule.error) ? <Alert role="alert" tone="error" title={reschedule.error.message} /> : null}
          <TimeStep
            draft={draft}
            update={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onNext={submit}
            actions={(ready) => (
              <DialogFooter className="px-0">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Keep current time
                </Button>
                <Button type="submit" disabled={!ready} loading={reschedule.isPending}>
                  Move my visit
                </Button>
              </DialogFooter>
            )}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ booking, onClose }: { booking: MyBookingResponse; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const refresh = useRefreshBookings();
  const cancel = useCancelMyBooking({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await refresh();
        onClose();
      },
    },
  });

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader title={`Cancel ${booking.srNumber}?`} description="There's no charge for cancelling before the technician sets out." />
        <DialogBody className="flex flex-col gap-4">
          {isApiError(cancel.error) ? <Alert role="alert" tone="error" title={cancel.error.message} /> : null}
          <Field label="Why are you cancelling?" optional hint="It helps us do better.">
            <Textarea value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="destructive" loading={cancel.isPending} onClick={() => cancel.mutate({ id: booking.id, data: { reason: reason.trim() || null } })}>
            Cancel booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
