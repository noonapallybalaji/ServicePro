import {
  getListMyBookingsQueryKey,
  isApiError,
  useCancelMyBooking,
  type MyBookingResponse,
} from '@servicepro/api-client';
import { Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Textarea } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

/**
 * Cancel a booking (allowed until the technician sets out; the API has the final word, and its
 * settings decide whether the button appears). Visit times are agreed with the office: to change
 * one, the customer asks for help.
 */
export function BookingChanges({ booking }: { booking: MyBookingResponse }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
      {booking.canCancel ? (
        <Button size="sm" variant="ghost" className="text-error" onClick={() => setOpen(true)}>
          <X aria-hidden /> Cancel booking
        </Button>
      ) : null}
      <Button asChild size="sm" variant="ghost">
        <Link to={`/account?tab=help&booking=${booking.id}`}>
          <LifeBuoy aria-hidden /> Get help
        </Link>
      </Button>
      {open ? <CancelDialog booking={booking} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function useRefreshBookings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getListMyBookingsQueryKey() });
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
