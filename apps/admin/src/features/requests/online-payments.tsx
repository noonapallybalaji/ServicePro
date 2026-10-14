import {
  getGetPaymentActivityQueryKey,
  isApiError,
  useGetPaymentActivity,
  useProcessQueuedRefund,
  useRefundPayment,
  useSendPaymentLink,
  useSession,
  type RefundablePaymentResponse,
  type RefundResponse,
  type ServiceRequestDetail,
} from '@servicepro/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Stack,
  Text,
  formatDateTime,
  formatINR,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { fieldError, humanize } from '../../components/common';

const REFUND_TONE = { NEEDS_REVIEW: 'warning', PENDING: 'info', PROCESSED: 'success', FAILED: 'error' } as const;

/**
 * Payment links sent to the customer, payments with what's still refundable, and refunds.
 * Refunds are for owners and admins only (the API enforces it too).
 */
export function OnlinePaymentsPanel({ request }: { request: ServiceRequestDetail }) {
  const id = request.card.id;
  const activity = useGetPaymentActivity(id, { query: { enabled: Boolean(request.invoice) } });
  const { session } = useSession();
  const canRefund = session?.user.role === 'OWNER' || session?.user.role === 'ADMIN';
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetPaymentActivityQueryKey(id) });
  const [refunding, setRefunding] = useState<RefundablePaymentResponse | null>(null);
  const sendLink = useSendPaymentLink({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await refresh();
        toast.success('Payment link sent on WhatsApp');
      },
    },
  });

  if (!request.invoice || !activity.data) return null;
  const { onlinePaymentsAvailable, payments, links, refunds } = activity.data;
  const outstanding = request.invoice.total - request.invoice.amountPaid;
  const queued = refunds.filter((r) => r.status === 'NEEDS_REVIEW');

  return (
    <Card className="flex flex-col gap-4">
      <Text variant="overline" tone="muted">
        Payments and refunds
      </Text>

      {queued.length > 0 ? (
        <Alert
          tone="warning"
          title={`The customer paid ${formatINR(queued.reduce((sum, r) => sum + r.amount, 0))} more than the bill`}
          description="Refund it below. Online payments go back to the way they paid."
        />
      ) : null}

      {outstanding > 0 && request.card.status === 'COMPLETED' ? (
        onlinePaymentsAvailable ? (
          <div className="flex flex-col gap-2">
            {isApiError(sendLink.error) ? <Alert tone="error" title={sendLink.error.message} /> : null}
            <Button size="sm" variant="outline" className="self-start" loading={sendLink.isPending} onClick={() => sendLink.mutate({ serviceRequestId: id })}>
              <Link2 aria-hidden /> Send payment link ({formatINR(outstanding)})
            </Button>
            <Text variant="caption" tone="muted">
              Sent on WhatsApp. The customer can also pay from their tracking page.
            </Text>
          </div>
        ) : (
          <Text variant="caption" tone="muted">
            Online payment isn't set up (add the Razorpay keys on the server).
          </Text>
        )
      ) : null}

      {links.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2">
              <a className="link truncate" href={link.url} target="_blank" rel="noreferrer">
                Link for {formatINR(link.amount)}
              </a>
              <Badge size="sm" tone={link.status === 'PAID' ? 'success' : 'neutral'}>
                {humanize(link.status)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {payments.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {formatINR(payment.amount)} · {humanize(payment.method)}
                <span className="block text-xs text-foreground-muted">{formatDateTime(payment.receivedAt)}</span>
              </span>
              {canRefund && payment.refundable > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setRefunding(payment)}>
                  <Undo2 aria-hidden /> Refund
                </Button>
              ) : payment.refundable < payment.amount ? (
                <Text variant="caption" tone="muted">
                  Refunded {formatINR(payment.amount - payment.refundable)}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {refunds.length > 0 ? (
        <ul className="flex flex-col gap-2 border-t border-border pt-3">
          {refunds.map((refund) => (
            <RefundRow key={refund.id} refund={refund} requestId={id} canRefund={canRefund} onChanged={refresh} />
          ))}
        </ul>
      ) : null}

      {refunding ? <RefundDialog requestId={id} payment={refunding} onClose={() => setRefunding(null)} onDone={refresh} /> : null}
    </Card>
  );
}

function RefundRow({ refund, requestId, canRefund, onChanged }: { refund: RefundResponse; requestId: string; canRefund: boolean; onChanged: () => Promise<void> }) {
  const process = useProcessQueuedRefund({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await onChanged();
        toast.success('Refund started');
      },
    },
  });

  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Refund {formatINR(refund.amount)} · {refund.reason}
        </span>
        <Badge size="sm" tone={REFUND_TONE[refund.status]}>
          {humanize(refund.status)}
        </Badge>
      </div>
      {refund.failureReason ? <Text variant="caption" tone="error">{refund.failureReason}</Text> : null}
      {isApiError(process.error) ? <Alert tone="error" title={process.error.message} /> : null}
      {canRefund && refund.status === 'NEEDS_REVIEW' ? (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          loading={process.isPending}
          onClick={() => process.mutate({ serviceRequestId: requestId, refundId: refund.id, data: { reference: null } })}
        >
          Refund now
        </Button>
      ) : null}
    </li>
  );
}

function RefundDialog({ requestId, payment, onClose, onDone }: { requestId: string; payment: RefundablePaymentResponse; onClose: () => void; onDone: () => Promise<void> }) {
  const online = payment.method === 'ONLINE';
  const [amount, setAmount] = useState(String(payment.refundable));
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const refund = useRefundPayment({
    mutation: {
      meta: { silent: true },
      onSuccess: async (result) => {
        await onDone();
        toast.success(result.status === 'PROCESSED' ? 'Refund recorded' : 'Refund started with the payment gateway');
        onClose();
      },
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader
          title="Refund payment"
          description={
            online
              ? `Goes back to the way the customer paid. Up to ${formatINR(payment.refundable)}.`
              : `Return the money to the customer (cash or UPI), then record it here. Up to ${formatINR(payment.refundable)}.`
          }
        />
        <DialogBody>
          <Stack gap={4}>
            {isApiError(refund.error) && !refund.error.fieldErrors ? <Alert tone="error" title={refund.error.message} /> : null}
            <Field label="Amount" error={fieldError(refund.error, 'amount')}>
              <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="Reason" error={fieldError(refund.error, 'reason')}>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Part not needed" />
            </Field>
            {online ? null : (
              <Field label="Reference" optional>
                <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UPI / UTR reference" />
              </Field>
            )}
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={refund.isPending}
            disabled={Number(amount) <= 0 || reason.trim().length < 3}
            onClick={() =>
              refund.mutate({
                serviceRequestId: requestId,
                paymentId: payment.id,
                data: { amount: Number(amount), reason: reason.trim(), reference: reference.trim() || null },
              })
            }
          >
            Refund {formatINR(Number(amount) || 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
